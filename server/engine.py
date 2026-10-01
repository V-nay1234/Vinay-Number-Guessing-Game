"""
Core Game Engine for 2-Player Number Guessing Game.
Pure, deterministic, server-authoritative game logic.
"""
from enum import Enum
from typing import List, Tuple, Optional

class GuessResult(str, Enum):
    GREEN = "GREEN"   # Right digit, right position
    YELLOW = "YELLOW" # Right digit, wrong position
    RED = "RED"       # Digit not present in secret at all

class GameStatus(str, Enum):
    CREATED = "CREATED"
    WAITING_FOR_PLAYER = "WAITING_FOR_PLAYER"
    PLAYER_2_JOINED = "PLAYER_2_JOINED"
    CHOOSING_NUMBER_LENGTH = "CHOOSING_NUMBER_LENGTH"
    WAITING_FOR_SECRET_NUMBERS = "WAITING_FOR_SECRET_NUMBERS"
    READY = "READY"
    PLAYER_1_TURN = "PLAYER_1_TURN"
    PLAYER_2_TURN = "PLAYER_2_TURN"
    GAME_WON = "GAME_WON"
    GAME_DISCONNECTED = "GAME_DISCONNECTED"
    REMATCH = "REMATCH"

ALLOWED_NUMBER_LENGTHS = {3, 4, 5, 6}

def evaluate_guess(secret: str, guess: str) -> List[str]:
    """
    Evaluates a guess against a secret number using Wordle-style rules:
      GREEN  — digit is correct value AND correct position
      YELLOW — digit exists in secret but is in the WRONG position
      RED    — digit does not appear anywhere in the remaining secret digits

    Duplicate-safe two-pass algorithm:
      Pass 1: Mark GREEN matches; remove matched secret chars from the pool.
      Pass 2: For non-GREEN positions, check remaining secret pool for YELLOW.

    Both numbers must be strings of the same length containing only digits 0-9.
    """
    if len(secret) != len(guess):
        raise ValueError(f"Length mismatch: secret length is {len(secret)}, guess length is {len(guess)}")

    n = len(secret)
    results: List[str] = [GuessResult.RED.value] * n
    # Pool of secret characters not yet matched by a GREEN
    secret_pool: List[Optional[str]] = list(secret)

    # Pass 1: Greens
    for i in range(n):
        if guess[i] == secret[i]:
            results[i] = GuessResult.GREEN.value
            secret_pool[i] = None  # consumed

    # Pass 2: Yellows
    for i in range(n):
        if results[i] == GuessResult.GREEN.value:
            continue
        for j in range(n):
            if secret_pool[j] == guess[i]:
                results[i] = GuessResult.YELLOW.value
                secret_pool[j] = None  # consume from pool
                break

    return results

def is_winning_result(results: List[str]) -> bool:
    """Returns True if every digit is GREEN."""
    return len(results) > 0 and all(r == GuessResult.GREEN.value for r in results)

def validate_number_length(length: int) -> Tuple[bool, Optional[str]]:
    """Validates if selected digit length is allowed (3, 4, 5, or 6)."""
    if length not in ALLOWED_NUMBER_LENGTHS:
        return False, f"Number length must be 3, 4, 5, or 6 (received {length})"
    return True, None

def validate_secret_number(num_str: str, expected_length: int) -> Tuple[bool, Optional[str]]:
    """
    Validates a secret or guessed number:
    - Must be a string
    - Must consist strictly of digits 0-9
    - Must have exact expected_length
    - Leading zeros ALLOWED (e.g., '007', '000')
    - Duplicate digits ALLOWED (e.g., '112', '55555')
    """
    if not isinstance(num_str, str):
        return False, "Number must be provided as a string to preserve leading zeros."
    
    if len(num_str) != expected_length:
        return False, f"Expected {expected_length} digits, but received {len(num_str)} digits."
    
    if not num_str.isdigit():
        return False, "Number must contain only numeric digits (0-9)."
    
    return True, None

def sanitize_name(name: str) -> str:
    """Sanitizes player name, removes dangerous characters, trims."""
    if not name:
        return "Anonymous"
    clean = name.strip()[:24]
    # Strip script tags or angle brackets
    clean = clean.replace("<", "").replace(">", "").replace("&", "")
    return clean if clean else "Player"
