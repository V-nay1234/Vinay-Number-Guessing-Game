"""
In-memory token bucket / sliding timestamp rate limiter.
"""
import time
from typing import Dict
from server.config import settings

class RateLimiter:
    def __init__(self):
        self._last_guess_time: Dict[str, float] = {}
        self._last_chat_time: Dict[str, float] = {}
        self._last_typing_time: Dict[str, float] = {}

    def can_guess(self, player_id: str) -> bool:
        now = time.time()
        last = self._last_guess_time.get(player_id, 0.0)
        if now - last < settings.RATE_LIMIT_GUESS_SECONDS:
            return False
        self._last_guess_time[player_id] = now
        return True

    def can_chat(self, player_id: str) -> bool:
        now = time.time()
        last = self._last_chat_time.get(player_id, 0.0)
        if now - last < settings.RATE_LIMIT_CHAT_SECONDS:
            return False
        self._last_chat_time[player_id] = now
        return True

    def can_send_typing(self, player_id: str) -> bool:
        now = time.time()
        last = self._last_typing_time.get(player_id, 0.0)
        # Throttle typing indicator messages to max 1 per 1.5 seconds
        if now - last < 1.5:
            return False
        self._last_typing_time[player_id] = now
        return True

rate_limiter = RateLimiter()
