"""
WebSocket connection manager and real-time event router.
Handles room connections, state broadcasting, chat, typing, and WebRTC signaling.
"""
import uuid
from datetime import datetime, timezone
from typing import Dict, Optional, Any
from starlette.websockets import WebSocket, WebSocketState
from server.models import GameRoom, Player, GuessRecord, ChatMessage
from server.database import (
    get_game, save_game, add_guess, get_guesses,
    add_chat, get_chat, clear_guesses_and_reset_game
)
from server.engine import (
    evaluate_guess, is_winning_result,
    validate_secret_number, validate_number_length,
    GameStatus, sanitize_name
)
from server.rate_limiter import rate_limiter

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class ConnectionManager:
    def __init__(self):
        # game_id -> {player_id: WebSocket}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, game_id: str, player_id: str, websocket: WebSocket):
        await websocket.accept()
        if game_id not in self.active_connections:
            self.active_connections[game_id] = {}
        self.active_connections[game_id][player_id] = websocket

    def disconnect(self, game_id: str, player_id: str):
        if game_id in self.active_connections:
            self.active_connections[game_id].pop(player_id, None)
            if not self.active_connections[game_id]:
                del self.active_connections[game_id]

    async def send_json(self, websocket: WebSocket, data: dict):
        state = getattr(websocket, "client_state", WebSocketState.CONNECTED)
        if state == WebSocketState.CONNECTED or state == 1:
            await websocket.send_json(data)

    async def broadcast_state(self, game_id: str):
        game = get_game(game_id)
        if not game:
            return

        guesses = get_guesses(game_id)
        chat_messages = get_chat(game_id)

        connections = self.active_connections.get(game_id, {})
        for player_id, ws in list(connections.items()):
            try:
                state = game.to_client_state(for_player_id=player_id, guesses=guesses, chat_messages=chat_messages)
                await self.send_json(ws, {"type": "STATE_UPDATE", "data": state})
            except Exception:
                pass

    async def send_system_message(self, game_id: str, text: str):
        msg = ChatMessage(
            message_id=str(uuid.uuid4()),
            game_id=game_id,
            player_id=None,
            player_name="System",
            message=text,
            is_system=True,
            timestamp=utc_now_iso()
        )
        add_chat(msg)
        connections = self.active_connections.get(game_id, {})
        for ws in list(connections.values()):
            try:
                await self.send_json(ws, {"type": "CHAT_MESSAGE", "data": msg.model_dump()})
            except Exception:
                pass

    async def broadcast_chat_message(self, game_id: str, player: Player, text: str):
        msg = ChatMessage(
            message_id=str(uuid.uuid4()),
            game_id=game_id,
            player_id=player.player_id,
            player_name=player.name,
            message=text.strip()[:500],
            is_system=False,
            timestamp=utc_now_iso()
        )
        add_chat(msg)
        connections = self.active_connections.get(game_id, {})
        for ws in list(connections.values()):
            try:
                await self.send_json(ws, {"type": "CHAT_MESSAGE", "data": msg.model_dump()})
            except Exception:
                pass

    async def broadcast_typing(self, game_id: str, from_player_id: str, from_player_name: str, is_typing: bool):
        connections = self.active_connections.get(game_id, {})
        for pid, ws in list(connections.items()):
            if pid != from_player_id:
                try:
                    await self.send_json(ws, {
                        "type": "TYPING_STATUS",
                        "data": {
                            "player_id": from_player_id,
                            "player_name": from_player_name,
                            "is_typing": is_typing
                        }
                    })
                except Exception:
                    pass

    async def relay_webrtc(self, game_id: str, from_player_id: str, payload_type: str, data: Any):
        connections = self.active_connections.get(game_id, {})
        for pid, ws in list(connections.items()):
            if pid != from_player_id:
                try:
                    await self.send_json(ws, {
                        "type": payload_type,
                        "data": data,
                        "from_player_id": from_player_id
                    })
                except Exception:
                    pass

ws_manager = ConnectionManager()

async def handle_websocket_message(game_id: str, player_id: str, data: dict, websocket: WebSocket):
    action = data.get("action")
    game = get_game(game_id)
    if not game:
        await ws_manager.send_json(websocket, {"type": "ERROR", "message": "Game room not found."})
        return

    player = game.get_player(player_id)
    if not player:
        await ws_manager.send_json(websocket, {"type": "ERROR", "message": "Player not registered in this room."})
        return

    opponent = game.get_opponent(player_id)

    # 1. SELECT NUMBER LENGTH
    if action == "SELECT_LENGTH":
        length = data.get("length")
        if not isinstance(length, int):
            await ws_manager.send_json(websocket, {"type": "ERROR", "message": "Invalid digit length."})
            return
        valid, err = validate_number_length(length)
        if not valid:
            await ws_manager.send_json(websocket, {"type": "ERROR", "message": err})
            return

        player.number_length = length
        game.updated_at = utc_now_iso()

        await ws_manager.send_system_message(game_id, f"{player.name} selected a {length}-digit secret number.")

        # Check if both have selected length
        if game.player_1 and game.player_2 and game.player_1.number_length and game.player_2.number_length:
            game.status = GameStatus.WAITING_FOR_SECRET_NUMBERS.value

        save_game(game)
        await ws_manager.broadcast_state(game_id)

    # 2. SUBMIT SECRET NUMBER
    elif action == "SUBMIT_SECRET":
        secret = data.get("secret_number")
        if not player.number_length:
            await ws_manager.send_json(websocket, {"type": "ERROR", "message": "Please select a number length first."})
            return

        valid, err = validate_secret_number(secret, player.number_length)
        if not valid:
            await ws_manager.send_json(websocket, {"type": "ERROR", "message": err})
            return

        player.secret_number = secret
        player.ready = True
        game.updated_at = utc_now_iso()

        await ws_manager.send_system_message(game_id, f"{player.name} locked in their secret number.")

        # If both ready, start the game
        if game.player_1 and game.player_2 and game.player_1.ready and game.player_2.ready:
            game.status = GameStatus.PLAYER_1_TURN.value
            game.current_turn = game.player_1.player_id
            await ws_manager.send_system_message(
                game_id,
                f"Both players are ready! The duel begins! {game.player_1.name}'s turn."
            )

        save_game(game)
        await ws_manager.broadcast_state(game_id)

    # 3. SUBMIT GUESS (Authoritative server validation)
    elif action == "SUBMIT_GUESS":
        if game.status not in (GameStatus.PLAYER_1_TURN.value, GameStatus.PLAYER_2_TURN.value):
            await ws_manager.send_json(websocket, {"type": "ERROR", "message": "Game is not currently accepting guesses."})
            return

        if game.current_turn != player_id:
            await ws_manager.send_json(websocket, {"type": "ERROR", "message": "It is not your turn."})
            return

        if not opponent or not opponent.secret_number or not opponent.number_length:
            await ws_manager.send_json(websocket, {"type": "ERROR", "message": "Opponent data is not ready."})
            return

        guess_val = data.get("guess")
        valid, err = validate_secret_number(guess_val, opponent.number_length)
        if not valid:
            await ws_manager.send_json(websocket, {"type": "ERROR", "message": err})
            return

        if not rate_limiter.can_guess(player_id):
            await ws_manager.send_json(websocket, {"type": "ERROR", "message": "Submitting too fast. Please wait a moment."})
            return

        # Pure evaluation
        results = evaluate_guess(opponent.secret_number, guess_val)
        is_win = is_winning_result(results)

        game.turn_count += 1
        guess_rec = GuessRecord(
            guess_id=str(uuid.uuid4()),
            game_id=game_id,
            player_id=player_id,
            player_name=player.name,
            guess_value=guess_val,
            result=results,
            turn_number=game.turn_count,
            timestamp=utc_now_iso()
        )
        add_guess(guess_rec)

        if is_win:
            game.status = GameStatus.GAME_WON.value
            game.winner = player_id
            game.current_turn = None
            game.updated_at = utc_now_iso()
            save_game(game)
            await ws_manager.send_system_message(
                game_id,
                f"🏆 {player.name} guessed {opponent.name}'s secret number ({opponent.secret_number}) and WON THE GAME!"
            )
        else:
            # Switch turn
            next_player = opponent
            game.current_turn = next_player.player_id
            if next_player.player_id == (game.player_1.player_id if game.player_1 else None):
                game.status = GameStatus.PLAYER_1_TURN.value
            else:
                game.status = GameStatus.PLAYER_2_TURN.value
            game.updated_at = utc_now_iso()
            save_game(game)
            await ws_manager.send_system_message(
                game_id,
                f"{player.name} submitted a guess. It is now {next_player.name}'s turn."
            )

        await ws_manager.broadcast_state(game_id)

    # 4. CHAT MESSAGE
    elif action == "SEND_CHAT":
        if not rate_limiter.can_chat(player_id):
            await ws_manager.send_json(websocket, {"type": "ERROR", "message": "Sending messages too fast."})
            return
        text = data.get("message", "")
        if text and text.strip():
            clean_text = text.strip()[:500]
            await ws_manager.broadcast_chat_message(game_id, player, clean_text)

    # 5. TYPING INDICATOR
    elif action == "TYPING":
        is_typing = bool(data.get("is_typing", False))
        if rate_limiter.can_send_typing(player_id):
            await ws_manager.broadcast_typing(game_id, player_id, player.name, is_typing)

    # 6. REMATCH
    elif action == "REMATCH":
        if game.status == GameStatus.GAME_WON.value:
            clear_guesses_and_reset_game(game_id, GameStatus.CHOOSING_NUMBER_LENGTH.value)
            await ws_manager.send_system_message(
                game_id,
                f"{player.name} initiated a Rematch! Select your new number lengths."
            )
            await ws_manager.broadcast_state(game_id)

    # 7. WEBRTC SIGNALING (Optional audio/video communication)
    elif action in ("WEBRTC_REQUEST", "WEBRTC_RESPONSE", "WEBRTC_OFFER", "WEBRTC_ANSWER", "WEBRTC_ICE_CANDIDATE", "WEBRTC_HANGUP"):
        await ws_manager.relay_webrtc(game_id, player_id, action, data.get("payload"))
