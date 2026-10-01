"""
FastAPI Application: REST API endpoints, WebSocket server, and static file serving.
"""
import os
import random
import string
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from server.config import settings
from server.database import init_db, save_game, get_game, get_game_by_code
from server.models import (
    GameRoom, Player, CreateGameRequest, CreateGameResponse,
    JoinGameRequest, JoinGameResponse, ReconnectRequest
)
from server.engine import GameStatus, sanitize_name
from server.ws_manager import ws_manager, handle_websocket_message, utc_now_iso

app = FastAPI(title="2-Player Number Duel API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def generate_game_code() -> str:
    """Generates an unambiguous 6-character alphanumeric game code (e.g., AB7K92)."""
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(random.choices(chars, k=6))
        if not get_game_by_code(code):
            return code

@app.on_event("startup")
def on_startup():
    init_db()

@app.post("/api/create", response_model=CreateGameResponse)
async def create_game(req: CreateGameRequest, request: Request):
    name = sanitize_name(req.player_name)
    game_id = str(uuid.uuid4())
    game_code = generate_game_code()
    player_id = str(uuid.uuid4())
    session_token = str(uuid.uuid4())
    now = utc_now_iso()
    exp = (datetime.now(timezone.utc) + timedelta(hours=settings.ROOM_EXPIRATION_HOURS)).isoformat()

    player_1 = Player(
        player_id=player_id,
        session_token=session_token,
        name=name,
        joined_at=now
    )

    room = GameRoom(
        game_id=game_id,
        game_code=game_code,
        status=GameStatus.WAITING_FOR_PLAYER.value,
        player_1=player_1,
        player_2=None,
        created_at=now,
        updated_at=now,
        expiration=exp
    )
    save_game(room)

    # Determine public URL
    base_url = settings.PUBLIC_URL
    if not base_url:
        base_url = str(request.base_url).rstrip("/")
    shareable_url = f"{base_url}/?join={game_code}"

    return CreateGameResponse(
        game_id=game_id,
        game_code=game_code,
        player_id=player_id,
        session_token=session_token,
        shareable_url=shareable_url
    )

@app.post("/api/join", response_model=JoinGameResponse)
async def join_game(req: JoinGameRequest):
    code = req.game_code.strip().upper()
    game = get_game_by_code(code)
    if not game:
        raise HTTPException(status_code=404, detail="Game room not found. Check the code and try again.")

    # Check if game already has 2 players
    if game.player_1 and game.player_2:
        raise HTTPException(status_code=403, detail="This game already has 2 players.")

    name = sanitize_name(req.player_name)
    player_id = str(uuid.uuid4())
    session_token = str(uuid.uuid4())
    now = utc_now_iso()

    player_2 = Player(
        player_id=player_id,
        session_token=session_token,
        name=name,
        joined_at=now
    )

    game.player_2 = player_2
    game.status = GameStatus.CHOOSING_NUMBER_LENGTH.value
    game.updated_at = now
    save_game(game)

    # Announce system message & notify Player 1
    await ws_manager.send_system_message(game.game_id, f"{name} joined the game.")
    await ws_manager.broadcast_state(game.game_id)

    return JoinGameResponse(
        game_id=game.game_id,
        game_code=game.game_code,
        player_id=player_id,
        session_token=session_token
    )

@app.post("/api/reconnect")
async def reconnect(req: ReconnectRequest):
    game = get_game(req.game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found.")

    player = game.get_player(req.player_id)
    if not player or player.session_token != req.session_token:
        raise HTTPException(status_code=401, detail="Invalid session credentials.")

    player.connected = True
    save_game(game)
    return {"status": "ok", "game_code": game.game_code}

@app.get("/api/game/{game_code}")
async def get_game_info(game_code: str):
    game = get_game_by_code(game_code)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found.")
    return {
        "game_code": game.game_code,
        "status": game.status,
        "player_1_name": game.player_1.name if game.player_1 else None,
        "player_2_name": game.player_2.name if game.player_2 else None,
        "is_full": bool(game.player_1 and game.player_2)
    }

@app.websocket("/ws/{game_id}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: str, player_id: str, token: str = Query(...)):
    game = get_game(game_id)
    if not game:
        await websocket.close(code=4004, reason="Game not found")
        return

    player = game.get_player(player_id)
    if not player or player.session_token != token:
        await websocket.close(code=4003, reason="Unauthorized session")
        return

    await ws_manager.connect(game_id, player_id, websocket)
    player.connected = True
    save_game(game)

    # Broadcast updated connection state
    await ws_manager.broadcast_state(game_id)
    await ws_manager.send_system_message(game_id, f"{player.name} connected.")

    try:
        while True:
            data = await websocket.receive_json()
            await handle_websocket_message(game_id, player_id, data, websocket)
    except WebSocketDisconnect:
        ws_manager.disconnect(game_id, player_id)
        # Update connection status
        current_game = get_game(game_id)
        if current_game:
            p = current_game.get_player(player_id)
            if p:
                p.connected = False
                save_game(current_game)
                await ws_manager.broadcast_state(game_id)
                await ws_manager.send_system_message(game_id, f"{p.name} disconnected.")
    except Exception as e:
        ws_manager.disconnect(game_id, player_id)

# Serve static files and single page app
static_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")
    css_dir = os.path.join(static_dir, "css")
    js_dir = os.path.join(static_dir, "js")
    if os.path.exists(css_dir):
        app.mount("/css", StaticFiles(directory=css_dir), name="css")
    if os.path.exists(js_dir):
        app.mount("/js", StaticFiles(directory=js_dir), name="js")

@app.get("/")
@app.get("/game/{game_code}")
async def serve_index(request: Request, game_code: Optional[str] = None):
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Number Duel Backend API running. Static files pending."}
