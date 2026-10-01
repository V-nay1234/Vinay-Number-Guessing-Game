/**
 * UI Renderer and DOM Component Manipulator.
 */

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "status");

  const icon = type === "error" ? "⚠️" : type === "success" ? "✅" : "ℹ️";
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(text) {
  if (!text) return "";
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
  return text.toString().replace(/[&<>"']/g, m => map[m]);
}

class UIRenderer {
  constructor() {
    this.currentStage = null;
    this.activeHistoryTab = "my"; // 'my' or 'opp'
    this.cachedState = null;
  }

  render(state, myPlayerId) {
    this.cachedState = state;
    const me = state.player_1?.player_id === myPlayerId ? state.player_1 : state.player_2;
    const opponent = state.player_1?.player_id === myPlayerId ? state.player_2 : state.player_1;
    const isDuelActive = state.status === "PLAYER_1_TURN" || state.status === "PLAYER_2_TURN" || state.status === "READY";
    const mySecret = state.my_secret_number || me?.secret_number || (window.app?.secretInputDigits?.length ? window.app.secretInputDigits.join("") : null);

    // 1. Header Information (ROOM code or USER SECRET NUMBER in duel)
    const codeEl = document.getElementById("display-game-code");
    const codeLabelEl = document.getElementById("header-code-label");
    const headerPill = document.getElementById("header-room-pill");

    if (isDuelActive && mySecret) {
      if (codeLabelEl) codeLabelEl.textContent = "YOUR CODE:";
      if (codeEl) codeEl.textContent = mySecret;
      if (headerPill) {
        headerPill.classList.add("header-secret-mode");
        headerPill.title = `Your Code: ${mySecret} (Room: ${state.game_code || ""})`;
        headerPill.classList.toggle("code-len-5", mySecret.length === 5);
        headerPill.classList.toggle("code-len-6", mySecret.length >= 6);
      }
    } else {
      if (codeLabelEl) codeLabelEl.textContent = "ROOM:";
      if (codeEl) codeEl.textContent = state.game_code || "------";
      if (headerPill) {
        headerPill.classList.remove("header-secret-mode", "code-len-5", "code-len-6");
        headerPill.title = "Click to copy room code & invite link";
      }
    }

    const shareInput = document.getElementById("share-link-input");
    if (shareInput) {
      const shareUrl = `${window.location.origin}/?join=${state.game_code}`;
      shareInput.value = shareUrl;
    }

    // 2. Player Cards
    this.renderPlayerCards(state, myPlayerId, me, opponent);

    // 3. Secret HUD (Always shows my private secret number safely)
    this.renderSecretHUD(me, state);

    // 4. Game Stages & Turn Banner
    this.renderStages(state, myPlayerId, me, opponent);

    // 5. History
    this.renderHistory(state, myPlayerId);

    // 6. Chat Messages
    this.renderChatMessages(state.chat_messages, myPlayerId);

    // 7. Update Adaptive Section Badges
    this.updateSectionBadges(state, me, opponent);
  }

  updateSectionBadges(state, me, opponent) {
    // Players badge
    const pCountEl = document.getElementById("players-status-count");
    if (pCountEl) {
      const activeCount = (state.player_1?.connected ? 1 : 0) + (state.player_2?.connected ? 1 : 0);
      pCountEl.textContent = `${activeCount} / 2 Online`;
    }

    // HUD badge
    const hudStatus = document.getElementById("hud-secret-status");
    if (hudStatus) {
      hudStatus.textContent = me?.ready ? `Locked (${me.number_length}D)` : me?.number_length ? `Length: ${me.number_length}D` : "Not Set";
    }

    // History badge
    const totalMoves = (state.my_guesses?.length || 0) + (state.opponent_guesses?.length || 0);
    const histTotal = document.getElementById("history-total-badge");
    const navHist = document.getElementById("nav-history-badge");
    if (histTotal) histTotal.textContent = `${totalMoves} Moves`;
    if (navHist) navHist.textContent = state.my_guesses?.length || 0;
  }

  renderPlayerCards(state, myPlayerId, me, opponent) {
    // Player 1
    const p1 = state.player_1;
    const p1Card = document.getElementById("p1-card");
    const p1Name = document.getElementById("p1-name");
    const p1Pill = document.getElementById("p1-status-pill");
    const p1Length = document.getElementById("p1-length-badge");
    const p1Ready = document.getElementById("p1-ready-badge");

    if (p1) {
      p1Name.textContent = p1.name + (p1.player_id === myPlayerId ? " (You)" : "");
      p1Pill.textContent = p1.connected ? "Online" : "Disconnected";
      p1Pill.className = `status-pill ${p1.connected ? "online" : ""}`;
      p1Length.textContent = p1.number_length ? `${p1.number_length} Digits` : "Choosing...";
      p1Ready.textContent = p1.ready ? "Locked In" : "Pending";
      p1Ready.style.color = p1.ready ? "var(--color-green)" : "var(--text-muted)";
    } else {
      p1Name.textContent = "Waiting for Player 1...";
      p1Pill.textContent = "Offline";
      p1Length.textContent = "—";
      p1Ready.textContent = "Pending";
    }

    // Player 2
    const p2 = state.player_2;
    const p2Card = document.getElementById("p2-card");
    const p2Name = document.getElementById("p2-name");
    const p2Pill = document.getElementById("p2-status-pill");
    const p2Length = document.getElementById("p2-length-badge");
    const p2Ready = document.getElementById("p2-ready-badge");

    if (p2) {
      p2Name.textContent = p2.name + (p2.player_id === myPlayerId ? " (You)" : "");
      p2Pill.textContent = p2.connected ? "Online" : "Disconnected";
      p2Pill.className = `status-pill ${p2.connected ? "online" : ""}`;
      p2Length.textContent = p2.number_length ? `${p2.number_length} Digits` : "Choosing...";
      p2Ready.textContent = p2.ready ? "Locked In" : "Pending";
      p2Ready.style.color = p2.ready ? "var(--color-green)" : "var(--text-muted)";
    } else {
      p2Name.textContent = "Waiting for Player 2...";
      p2Pill.textContent = "Offline";
      p2Length.textContent = "—";
      p2Ready.textContent = "Pending";
    }

    // Sync Sleek Mobile Duel Strip
    const stripP1Name = document.getElementById("strip-p1-name");
    const stripP1Dot = document.getElementById("strip-p1-dot");
    if (stripP1Name && p1) {
      stripP1Name.textContent = p1.name + (p1.player_id === myPlayerId ? " (You)" : "");
      if (stripP1Dot) stripP1Dot.className = `duel-status-dot ${p1.connected ? "online" : ""}`;
    }
    const stripP2Name = document.getElementById("strip-p2-name");
    const stripP2Dot = document.getElementById("strip-p2-dot");
    if (stripP2Name) {
      if (p2) {
        stripP2Name.textContent = p2.name + (p2.player_id === myPlayerId ? " (You)" : "");
        if (stripP2Dot) stripP2Dot.className = `duel-status-dot ${p2.connected ? "online" : ""}`;
      } else {
        stripP2Name.textContent = "Waiting...";
        if (stripP2Dot) stripP2Dot.className = "duel-status-dot";
      }
    }

    // Active turn highlight
    if (state.current_turn) {
      p1Card?.classList.toggle("active-turn", state.current_turn === p1?.player_id);
      p2Card?.classList.toggle("active-turn", state.current_turn === p2?.player_id);
    } else {
      p1Card?.classList.remove("active-turn");
      p2Card?.classList.remove("active-turn");
    }
  }

  renderSecretHUD(me, state) {
    const hud = document.getElementById("my-secret-display");
    if (!hud) return;

    const secret = state.my_secret_number;
    if (secret) {
      hud.innerHTML = secret
        .split("")
        .map(ch => `<div class="hud-digit">${escapeHtml(ch)}</div>`)
        .join("");
    } else if (me?.number_length) {
      hud.innerHTML = Array(me.number_length)
        .fill(0)
        .map(() => `<div class="hud-digit" style="opacity:0.35">?</div>`)
        .join("");
    } else {
      hud.innerHTML = `<span class="digit-placeholder">— Not Chosen Yet —</span>`;
    }
  }

  renderStages(state, myPlayerId, me, opponent) {
    const status = state.status;
    const banner = document.getElementById("turn-banner");
    const bannerIcon = document.getElementById("banner-icon");
    const bannerTitle = document.getElementById("banner-title");
    const bannerSub = document.getElementById("banner-sub");
    const phoneFrame = document.getElementById("phone-frame-device");

    // Hide all stage sections first
    const stages = ["stage-waiting", "stage-length", "stage-secret", "stage-duel", "stage-victory"];
    stages.forEach(id => document.getElementById(id)?.classList.add("hidden"));

    const chosenLen = me?.number_length || window.app?.selectedLength;
    const isSecretLocked = me?.ready || !!me?.secret_number;
    const isDuelActive = status === "PLAYER_1_TURN" || status === "PLAYER_2_TURN" || status === "READY";

    // Setup focus mode & duel focus mode (ensures no extra sections below the arena)
    if (!isDuelActive && status !== "VICTORY") {
      phoneFrame?.classList.add("setup-focus-mode");
      phoneFrame?.classList.remove("duel-focus-mode");
    } else if (isDuelActive) {
      phoneFrame?.classList.remove("setup-focus-mode");
      phoneFrame?.classList.add("duel-focus-mode");
    } else {
      phoneFrame?.classList.remove("setup-focus-mode");
      phoneFrame?.classList.remove("duel-focus-mode");
    }

    // Update status text inside instructions overlay if open
    const statusTextEl = document.getElementById("instructions-status-text");
    if (statusTextEl) {
      if (opponent && opponent.ready) {
        statusTextEl.textContent = "⚔️ Opponent is ready! Click below to enter the duel.";
      } else {
        statusTextEl.textContent = "🔒 Your secret is locked! Match will start once opponent is ready.";
      }
    }

    // 1. SCREEN 2: CHOOSE NUMBER LENGTH (STEP 1)
    if (!chosenLen) {
      document.getElementById("stage-length")?.classList.remove("hidden");
      banner?.classList.add("hidden");

      const invitePrompt = document.getElementById("length-invite-prompt");
      if (invitePrompt) {
        invitePrompt.classList.toggle("hidden", !!opponent);
      }
      document.querySelectorAll(".length-btn").forEach(btn => btn.classList.remove("selected"));
      return;
    }

    // 2. SCREEN 3: ENTER SECRET NUMBER (STEP 2)
    if (!isSecretLocked && !isDuelActive) {
      document.getElementById("stage-secret")?.classList.remove("hidden");
      banner?.classList.add("hidden");

      const chosenLenEl = document.getElementById("chosen-length-text");
      if (chosenLenEl) chosenLenEl.textContent = chosenLen;

      if (window.app) {
        window.app.syncPinBoxes();
      }
      return;
    }

    // WAITING FOR OPPONENT AFTER LOCKING SECRET
    if (isSecretLocked && !isDuelActive) {
      document.getElementById("stage-secret")?.classList.remove("hidden");
      banner?.classList.add("hidden");
      const secretWaiting = document.getElementById("secret-waiting-note");
      secretWaiting?.classList.remove("hidden");
      return;
    }

    // 4. DUEL IN PROGRESS: TURNS
    if (status === "PLAYER_1_TURN" || status === "PLAYER_2_TURN" || status === "READY") {
      document.getElementById("stage-duel")?.classList.remove("hidden");
      banner?.classList.remove("hidden"); // Active turn banner shown for guessing turns

      const isMyTurn = state.is_my_turn;
      const targetLen = state.required_guess_length || 4;

      document.getElementById("target-length-count").textContent = targetLen;
      const turnBadge = document.getElementById("turn-indicator-badge");

      if (isMyTurn) {
        banner.className = "turn-banner banner-your-turn";
        bannerIcon.textContent = "🎯";
        bannerTitle.textContent = "YOUR TURN TO GUESS";
        bannerSub.textContent = `Submit a ${targetLen}-digit guess to test opponent's secret number!`;

        if (turnBadge) {
          turnBadge.className = "turn-indicator-badge turn-active";
          turnBadge.textContent = "YOUR TURN";
        }
      } else {
        const oppName = opponent ? opponent.name : "Opponent";
        banner.className = "turn-banner banner-opponent-turn";
        bannerIcon.textContent = "⏳";
        bannerTitle.textContent = `Waiting for ${oppName}...`;
        bannerSub.textContent = `${oppName} is currently analyzing and submitting a guess.`;

        if (turnBadge) {
          turnBadge.className = "turn-indicator-badge turn-waiting";
          turnBadge.textContent = "OPPONENT'S TURN";
        }
      }
      return;
    }

    // 5. GAME WON
    if (status === "GAME_WON") {
      document.getElementById("stage-victory")?.classList.remove("hidden");
      banner.className = "turn-banner banner-your-turn";
      bannerIcon.textContent = "🏆";

      const winnerId = state.winner;
      const winnerName = (winnerId === me?.player_id) ? me.name : (opponent ? opponent.name : "Winner");
      const isWinner = (winnerId === myPlayerId);

      bannerTitle.textContent = `${winnerName.toUpperCase()} WON THE MATCH!`;
      bannerSub.textContent = isWinner ? "Sensational tactical victory! You cracked their number!" : "Good effort! Rematch to reclaim the title.";

      document.getElementById("victory-title").textContent = `${winnerName.toUpperCase()} WON!`;
      document.getElementById("victory-subtitle").textContent = isWinner
        ? "Flawless deduction! You completely cracked the secret code!"
        : "Opponent cracked your secret number first. Ready for revenge?";

      const oppSecret = opponent?.secret_number || "—";
      document.getElementById("revealed-opponent-secret").textContent = oppSecret;
      document.getElementById("revealed-turns-count").textContent = state.turn_count || 1;
    }
  }

  renderHistory(state, myPlayerId) {
    const list = document.getElementById("guess-list-container");
    const myCount = document.getElementById("my-guess-count");
    const oppCount = document.getElementById("opp-guess-count");
    if (!list) return;

    const myGuesses = state.my_guesses || [];
    const oppGuesses = state.opponent_guesses || [];

    if (myCount) myCount.textContent = myGuesses.length;
    if (oppCount) oppCount.textContent = oppGuesses.length;

    const activeList = this.activeHistoryTab === "my" ? myGuesses : oppGuesses;

    if (activeList.length === 0) {
      list.innerHTML = `<div class="empty-history-text">No guesses in this tab yet.</div>`;
      return;
    }

    list.innerHTML = activeList
      .slice()
      .map(g => {
        const guessStr = String(g.guess_value || "");
        const tilesHtml = g.result
          .map((res, idx) => {
            const digitChar = guessStr[idx] !== undefined ? escapeHtml(guessStr[idx]) : "?";
            const isGreen = res === "GREEN";
            const isYellow = res === "YELLOW";
            let tileClass = "tile-red";
            let statusIcon = "🔴";
            let label = `Digit ${digitChar}: Not in secret`;

            if (isGreen) {
              tileClass = "tile-green";
              statusIcon = "🟢";
              label = `Digit ${digitChar}: Correct value & position`;
            } else if (isYellow) {
              tileClass = "tile-yellow";
              statusIcon = "🟡";
              label = `Digit ${digitChar}: Correct digit, WRONG position`;
            }

            return `
              <div class="guess-tile ${tileClass}" title="${label}" aria-label="${label}">
                <span class="tile-char">${digitChar}</span>
                <span class="tile-status-icon">${statusIcon}</span>
              </div>
            `;
          })
          .join("");

        return `
          <div class="guess-item">
            <div class="guess-item-left">
              <span class="guess-num">#${g.turn_number}</span>
            </div>
            <div class="guess-tiles-row">
              ${tilesHtml}
            </div>
          </div>
        `;
      })
      .join("");

    // Auto-scroll to bottom so newer guesses appear at the bottom!
    list.scrollTop = list.scrollHeight;
  }

  renderChatMessages(messages, myPlayerId) {
    const container = document.getElementById("chat-messages-container");
    if (!container || !messages) return;

    const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;

    container.innerHTML = messages
      .map(m => {
        if (m.is_system) {
          return `<div class="system-chat-msg">${escapeHtml(m.message)}</div>`;
        }
        const isSelf = m.player_id === myPlayerId;
        const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
        return `
          <div class="chat-bubble ${isSelf ? 'msg-self' : 'msg-peer'}">
            ${!isSelf ? `<div class="msg-sender">${escapeHtml(m.player_name)}</div>` : ''}
            <div class="msg-text">${escapeHtml(m.message)}</div>
            <div class="msg-time">${timeStr}</div>
          </div>
        `;
      })
      .join("");

    if (wasAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }

  setTyping(name, isTyping) {
    const el = document.getElementById("typing-indicator-text");
    if (!el) return;
    if (isTyping && name) {
      el.textContent = `${name} is typing...`;
    } else {
      el.textContent = "";
    }
  }

  showInstructionsOverlay() {
    const modal = document.getElementById("instructions-modal");
    if (modal) {
      modal.classList.remove("hidden");
    }
  }

  hideInstructionsOverlay() {
    const modal = document.getElementById("instructions-modal");
    if (modal) {
      modal.classList.add("hidden");
    }
  }
}

const ui = new UIRenderer();
