import os
from pydantic import BaseModel
from typing import Optional

class Settings(BaseModel):
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    PUBLIC_URL: Optional[str] = os.getenv("PUBLIC_URL", None)
    DATABASE_PATH: str = os.getenv("DATABASE_PATH", "number_game.db")
    SESSION_SECRET: str = os.getenv("SESSION_SECRET", "super-secret-number-game-key-2026")
    ROOM_EXPIRATION_HOURS: int = 24
    RATE_LIMIT_GUESS_SECONDS: float = 0.5
    RATE_LIMIT_CHAT_SECONDS: float = 0.3

settings = Settings()
