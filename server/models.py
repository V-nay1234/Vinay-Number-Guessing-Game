"""
Data models and schemas for 2-Player Number Guessing Game.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class Player(BaseModel):
    player_id: str
    session_token: str
    name: str
    connection_id: Optional[str] = None
    number_length: Optional[int] = None
    secret_number: Optional[str] = None
    ready: bool = False
    connected: bool = True
    camera_enabled: bool = False
    microphone_enabled: bool = False
    joined_at: str

    def to_public_dict(self, include_secret: bool = False) -> Dict[str, Any]:
        """Returns safe representation of player without leaking secret_number unless game is won."""
        data = {
            "player_id": self.player_id,
            "name": self.name,
            "number_length": self.number_length,
            "ready": self.ready,
            "connected": self.connected,
            "camera_enabled": self.camera_enabled,
            "microphone_enabled": self.microphone_enabled,
            "has_selected_length": self.number_length is not None,
            "has_submitted_secret": self.secret_number is not None,
        }
        if include_secret:
            data["secret_number"] = self.secret_number
        return data

class GuessRecord(BaseModel):
    guess_id: str
    game_id: str
    player_id: str
    player_name: str
    guess_value: str
    result: List[str]
    turn_number: int
    timestamp: str

class ChatMessage(BaseModel):
    message_id: str
    game_id: str
    player_id: Optional[str]
    player_name: str
    message: str
    is_system: bool = False
    timestamp: str

class GameRoom(BaseModel):
    game_id: str
    game_code: str
    status: str
    player_1: Optional[Player] = None
    player_2: Optional[Player] = None
    created_at: str
    updated_at: str
    current_turn: Optional[str] = None  # player_id of active player
    winner: Optional[str] = None        # player_id of winner
    turn_count: int = 0
    expiration: str

    def get_player(self, player_id: str) -> Optional[Player]:
        if self.player_1 and self.player_1.player_id == player_id:
            return self.player_1
        if self.player_2 and self.player_2.player_id == player_id:
            return self.player_2
        return None

    def get_opponent(self, player_id: str) -> Optional[Player]:
        if self.player_1 and self.player_1.player_id == player_id:
            return self.player_2
        if self.player_2 and self.player_2.player_id == player_id:
            return self.player_1
        return None

    def to_client_state(self, for_player_id: str, guesses: List[GuessRecord], chat_messages: List[ChatMessage]) -> Dict[str, Any]:
        """
        Builds client state view tailored for a specific player.
        SECURITY CRITICAL:
        Opponent's secret number is NEVER sent unless self.status == 'GAME_WON'.
        """
        game_finished = (self.status == "GAME_WON")
        
        p1_data = self.player_1.to_public_dict(include_secret=(game_finished or (self.player_1 and self.player_1.player_id == for_player_id))) if self.player_1 else None
        p2_data = self.player_2.to_public_dict(include_secret=(game_finished or (self.player_2 and self.player_2.player_id == for_player_id))) if self.player_2 else None

        me = self.get_player(for_player_id)
        opponent = self.get_opponent(for_player_id)

        # Required guess length for me: equal to opponent's chosen secret length!
        required_guess_length = opponent.number_length if (opponent and opponent.number_length) else None

        # Separate guesses: My guesses vs Opponent's guesses
        my_guesses = [g.model_dump() for g in guesses if g.player_id == for_player_id]
        opp_guesses = [g.model_dump() for g in guesses if opponent and g.player_id == opponent.player_id]

        return {
            "game_id": self.game_id,
            "game_code": self.game_code,
            "status": self.status,
            "player_1": p1_data,
            "player_2": p2_data,
            "current_turn": self.current_turn,
            "is_my_turn": (self.current_turn == for_player_id) if self.current_turn else False,
            "winner": self.winner,
            "turn_count": self.turn_count,
            "my_player_id": for_player_id,
            "my_secret_number": me.secret_number if me else None,
            "required_guess_length": required_guess_length,
            "my_guesses": my_guesses,
            "opponent_guesses": opp_guesses,
            "chat_messages": [m.model_dump() for m in chat_messages],
        }

# API Request/Response Schemas
class CreateGameRequest(BaseModel):
    player_name: str

class CreateGameResponse(BaseModel):
    game_id: str
    game_code: str
    player_id: str
    session_token: str
    shareable_url: str

class JoinGameRequest(BaseModel):
    game_code: str
    player_name: str

class JoinGameResponse(BaseModel):
    game_id: str
    game_code: str
    player_id: str
    session_token: str

class ReconnectRequest(BaseModel):
    game_id: str
    player_id: str
    session_token: str
