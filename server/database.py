"""
Database and Persistence Layer using SQLite.
Clean schema and queries for GameRoom, Player, Guess, and ChatMessage.
"""
import sqlite3
import json
from typing import Optional, List, Tuple
from datetime import datetime, timezone, timedelta
from server.config import settings
from server.models import GameRoom, Player, GuessRecord, ChatMessage

def get_connection():
    conn = sqlite3.connect(settings.DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    _init_tables(conn)
    return conn

def _init_tables(conn):
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS games (
        game_id TEXT PRIMARY KEY,
        game_code TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        current_turn TEXT,
        winner TEXT,
        turn_count INTEGER DEFAULT 0,
        expiration TEXT NOT NULL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        session_token TEXT NOT NULL,
        name TEXT NOT NULL,
        slot INTEGER NOT NULL,
        number_length INTEGER,
        secret_number TEXT,
        ready INTEGER DEFAULT 0,
        connected INTEGER DEFAULT 1,
        camera_enabled INTEGER DEFAULT 0,
        microphone_enabled INTEGER DEFAULT 0,
        joined_at TEXT NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(game_id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS guesses (
        guess_id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        guess_value TEXT NOT NULL,
        result_json TEXT NOT NULL,
        turn_number INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(game_id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        message_id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        player_id TEXT,
        player_name TEXT NOT NULL,
        message TEXT NOT NULL,
        is_system INTEGER DEFAULT 0,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(game_id)
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_games_code ON games(game_code)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_guesses_game ON guesses(game_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_chat_game ON chat_messages(game_id)")

    conn.commit()

def init_db():
    conn = get_connection()
    conn.close()

def save_game(game: GameRoom):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT OR REPLACE INTO games (
        game_id, game_code, status, created_at, updated_at, current_turn, winner, turn_count, expiration
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        game.game_id, game.game_code, game.status, game.created_at, game.updated_at,
        game.current_turn, game.winner, game.turn_count, game.expiration
    ))

    for slot_idx, player in enumerate([game.player_1, game.player_2], start=1):
        if player:
            cursor.execute("""
            INSERT OR REPLACE INTO players (
                player_id, game_id, session_token, name, slot, number_length,
                secret_number, ready, connected, camera_enabled, microphone_enabled, joined_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                player.player_id, game.game_id, player.session_token, player.name,
                slot_idx, player.number_length, player.secret_number,
                1 if player.ready else 0, 1 if player.connected else 0,
                1 if player.camera_enabled else 0, 1 if player.microphone_enabled else 0,
                player.joined_at
            ))

    conn.commit()
    conn.close()

def get_game(game_id: str) -> Optional[GameRoom]:
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM games WHERE game_id = ?", (game_id,))
    grow = cursor.fetchone()
    if not grow:
        conn.close()
        return None

    cursor.execute("SELECT * FROM players WHERE game_id = ? ORDER BY slot ASC", (game_id,))
    prows = cursor.fetchall()

    p1, p2 = None, None
    for prow in prows:
        player = Player(
            player_id=prow["player_id"],
            session_token=prow["session_token"],
            name=prow["name"],
            number_length=prow["number_length"],
            secret_number=prow["secret_number"],
            ready=bool(prow["ready"]),
            connected=bool(prow["connected"]),
            camera_enabled=bool(prow["camera_enabled"]),
            microphone_enabled=bool(prow["microphone_enabled"]),
            joined_at=prow["joined_at"]
        )
        if prow["slot"] == 1:
            p1 = player
        elif prow["slot"] == 2:
            p2 = player

    conn.close()
    return GameRoom(
        game_id=grow["game_id"],
        game_code=grow["game_code"],
        status=grow["status"],
        player_1=p1,
        player_2=p2,
        created_at=grow["created_at"],
        updated_at=grow["updated_at"],
        current_turn=grow["current_turn"],
        winner=grow["winner"],
        turn_count=grow["turn_count"],
        expiration=grow["expiration"]
    )

def get_game_by_code(game_code: str) -> Optional[GameRoom]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT game_id FROM games WHERE UPPER(game_code) = UPPER(?)", (game_code.strip(),))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return get_game(row["game_id"])

def add_guess(guess: GuessRecord):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO guesses (
        guess_id, game_id, player_id, player_name, guess_value, result_json, turn_number, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        guess.guess_id, guess.game_id, guess.player_id, guess.player_name,
        guess.guess_value, json.dumps(guess.result), guess.turn_number, guess.timestamp
    ))
    conn.commit()
    conn.close()

def get_guesses(game_id: str) -> List[GuessRecord]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM guesses WHERE game_id = ? ORDER BY turn_number ASC, timestamp ASC", (game_id,))
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        result.append(GuessRecord(
            guess_id=r["guess_id"],
            game_id=r["game_id"],
            player_id=r["player_id"],
            player_name=r["player_name"],
            guess_value=r["guess_value"],
            result=json.loads(r["result_json"]),
            turn_number=r["turn_number"],
            timestamp=r["timestamp"]
        ))
    return result

def add_chat(msg: ChatMessage):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO chat_messages (
        message_id, game_id, player_id, player_name, message, is_system, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        msg.message_id, msg.game_id, msg.player_id, msg.player_name,
        msg.message, 1 if msg.is_system else 0, msg.timestamp
    ))
    conn.commit()
    conn.close()

def get_chat(game_id: str) -> List[ChatMessage]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM chat_messages WHERE game_id = ? ORDER BY timestamp ASC", (game_id,))
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        result.append(ChatMessage(
            message_id=r["message_id"],
            game_id=r["game_id"],
            player_id=r["player_id"],
            player_name=r["player_name"],
            message=r["message"],
            is_system=bool(r["is_system"]),
            timestamp=r["timestamp"]
        ))
    return result

def clear_guesses_and_reset_game(game_id: str, new_status: str):
    """Used for REMATCH to keep players but reset numbers, guesses, turns."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM guesses WHERE game_id = ?", (game_id,))
    cursor.execute("""
    UPDATE players SET number_length = NULL, secret_number = NULL, ready = 0 WHERE game_id = ?
    """, (game_id,))
    cursor.execute("""
    UPDATE games SET status = ?, current_turn = NULL, winner = NULL, turn_count = 0 WHERE game_id = ?
    """, (new_status, game_id))
    conn.commit()
    conn.close()
