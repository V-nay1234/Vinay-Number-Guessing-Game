# VINAY NUMBER GUESSING ACTIVITY — 2-Player Online Tactical Guessing Game

A production-quality, real-time online multiplayer web game for exactly 2 players. Each player privately chooses a secret number and takes turns deducing and cracking the opponent's number.

---

## 🎮 Core Game Rules

1. **2 Players per Room**: Player 1 creates the room, gets a unique shareable invite link & 6-character room code (e.g., `AB7K92`), and shares it with Player 2.
2. **Independent Secret Lengths**: Each player chooses between **3, 4, 5, or 6 digits**.
   - If Player 1 chooses 3 digits and Player 2 chooses 5 digits:
     - Player 1 must submit 5-digit guesses to decode Player 2's secret number.
     - Player 2 must submit 3-digit guesses to decode Player 1's secret number.
3. **Number Format & Privacy**:
   - Stored as strings to strictly preserve leading zeros (e.g., `"007"`).
   - Duplicate digits allowed (e.g., `"112"`, `"55555"`).
   - Any digits 0–9.
   - **Secret Number Privacy**: The opponent's secret number is NEVER transmitted to the client before the game is won.
4. **Guess Evaluation**:
   - 🟢 **GREEN**: The guessed digit has the same value AND is located in the exact same position.
   - 🔴 **RED**: Anything else (even if the digit appears elsewhere in the secret number).
   - *NO Wordle-style yellow matching*.
5. **Win Condition**:
   - First player to score all 🟢 GREEN on a guess wins immediately!
   - Victory screen reveals opponent's secret number.
   - [REMATCH] button keeps both players in the room for a new match.
6. **Live Turn System**:
   - Server-authoritative turn validation.
   - Active player sees "YOUR TURN", inactive sees "Waiting for [Opponent]...".
7. **Real-time Chat, Typing Indicators & Emojis**:
   - Live chat stream with automatic scrolling.
   - Debounced typing indicators.
   - Quick emoji picker.
   - Automated system event logs (without leaking secret values).
8. **Reconnection Support**:
   - Persistent session tokens stored in `localStorage`.
   - Players can refresh or reconnect without losing turn or match state.
9. **Optional WebRTC Video & Audio**:
   - Peer-to-peer audio and video calling.
   - Explicit permission flow (Request -> Allow/Deny).
   - If denied or hardware is unavailable, the game continues 100% uninterrupted.

---

## 🏗️ Project Architecture

```
├── server/
│   ├── app.py           # FastAPI REST API, WebSocket endpoint, SPA serving
│   ├── config.py        # Settings & environment variables
│   ├── database.py      # SQLite persistence (GameRoom, Player, Guess, Chat)
│   ├── engine.py        # Pure deterministic game logic (evaluate_guess)
│   ├── models.py        # Pydantic schemas & state models
│   ├── rate_limiter.py  # Rate limiter for actions
│   └── ws_manager.py    # WebSocket room manager & WebRTC signaling
├── static/
│   ├── index.html       # Single Page Application
│   ├── css/
│   │   ├── style.css    # Core design system & layout
│   │   └── responsive.css # Breakpoints for mobile, tablet, desktop
│   └── js/
│       ├── app.js       # Main client controller
│       ├── ui.js        # DOM renderer & animations
│       ├── socket.js    # WebSocket client & auto-reconnect
│       ├── webrtc.js    # P2P Audio/Video WebRTC call manager
│       └── emoji.js     # Curated emoji picker
├── tests/
│   ├── test_engine.py   # Unit tests for evaluate_guess & Critical Tests 1-7
│   ├── test_api_ws.py   # Tests for 3rd player rejection, reconnect, privacy (Tests 8-9)
│   ├── test_scenarios.py # Full multi-turn game duel scenario test
│   └── test_webrtc_permission.py # Test 10: Camera denial test
├── run.py               # Local server entry point
├── requirements.txt     # Python dependencies
└── Dockerfile           # Production container configuration
```

---

## 🚀 Running Locally

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
2. **Start the application**:
   ```bash
   python run.py
   ```
3. Open your browser at:
   ```
   http://localhost:8000
   ```

---

## 🧪 Automated Test Suite

Run the full test suite with:
```bash
pytest tests/ -v
```

All 15 automated test cases validate the critical rules:
- **Test 1**: Exact match -> All GREEN, Winner = true.
- **Test 2**: Single mismatch -> GREEN GREEN GREEN RED GREEN.
- **Test 3**: Wrong position digit -> RED (no Wordle yellow).
- **Test 4**: Duplicate digits (`11223`).
- **Test 5**: Leading zeros (`007`).
- **Test 6**: Leading zero mismatch (`017` vs `007` -> GREEN RED GREEN).
- **Test 7**: Asymmetric lengths (3-digit P1 vs 6-digit P2).
- **Test 8**: Third player attempts to join -> 403 Forbidden.
- **Test 9**: Browser refresh -> Session restored without game reset.
- **Test 10**: Camera denied -> Game continues normally.

---

## 🌐 1-Click Free Cloud Deployment (Play with Friends Online)

Because this game uses a real-time Python WebSocket backend, it deploys directly to free cloud platforms connected to your GitHub repository:

### Option A: Deploy on Render (Recommended & Free)
1. Push your repository to **GitHub**.
2. Log into [Render.com](https://render.com) (free account).
3. Click **New +** -> **Web Service** -> Connect your GitHub repository.
4. Render automatically detects `render.yaml` or you can set:
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python run.py`
5. Click **Create Web Service**.
6. Once deployed, Render gives you a free live URL (e.g., `https://vinay-guessing-game.onrender.com`) that you and your friend can open from anywhere!

### Option B: Deploy on Railway / Koyeb
1. Connect your GitHub repository on [Railway.app](https://railway.app) or [Koyeb.com](https://koyeb.com).
2. It will automatically detect `Procfile` / `Dockerfile` and launch your game immediately.

---

## 🐙 Push to GitHub Guide

Run these commands in this folder:

```bash
# 1. Initialize git (if not already done)
git init

# 2. Stage all files
git add .

# 3. Commit
git commit -m "Initial commit: Vinay Number Guessing Activity"

# 4. Set default branch to main
git branch -M main

# 5. Add your GitHub repository remote
git remote add origin https://github.com/ABCD4521/Vinay_Number_Guessing_Activity.git

# 6. Push to GitHub
git push -u origin main
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|---|---|---|
| `HOST` | `0.0.0.0` | Bind host address |
| `PORT` | `8000` | Port to listen on (automatically set by Render/Railway/Heroku) |
| `PUBLIC_URL` | `None` | Public domain (e.g. `https://your-domain.com`) for shareable links |
| `DATABASE_PATH` | `number_game.db` | Path to SQLite database file |
| `SESSION_SECRET`| `secret-key` | Secret key for session security |

The application is completely self-contained with no external database or paid services required.

