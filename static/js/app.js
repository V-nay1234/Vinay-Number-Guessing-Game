/**
 * Main Game Controller: State Management, Events, User Interactions, and Flow.
 */

class AppController {
  constructor() {
    this.session = null; // { game_id, game_code, player_id, session_token }
    this.gameState = null;
    this.webrtc = null;

    // Buffer for entering Secret Number
    this.secretInputDigits = [];
    this.selectedLength = null;

    // Buffer for entering Guess
    this.guessInputDigits = [];

    // Typing debounce
    this.typingTimer = null;
    this.isTypingSent = false;
  }

  async init() {
    this.webrtc = new WebRTCManager(gameSocket);
    this.initSocketEvents();
    this.bindEvents();
    this.checkUrlForInvite();
    this.checkStoredSession();
  }

  // 1. Initial URL inspection (e.g. ?join=AB7K92 or /game/AB7K92 or #AB7K92)
  checkUrlForInvite() {
    const urlParams = new URLSearchParams(window.location.search);
    let joinCode = urlParams.get("join") || urlParams.get("code") || urlParams.get("room");

    // Also support path-based /game/AB7K92
    if (!joinCode && window.location.pathname.includes("/game/")) {
      const parts = window.location.pathname.split("/game/");
      if (parts[1]) {
        joinCode = parts[1].replace("/", "").trim();
      }
    }

    // Also support hash-based #AB7K92 or #join=AB7K92
    if (!joinCode && window.location.hash) {
      const hash = window.location.hash.replace("#", "").trim();
      if (hash.startsWith("join=")) {
        joinCode = hash.replace("join=", "").trim();
      } else if (hash.length >= 4) {
        joinCode = hash;
      }
    }

    const defaultActions = document.getElementById("lobby-default-actions");
    const directInviteBox = document.getElementById("lobby-invite-direct");
    const directCodeDisplay = document.getElementById("invite-direct-code-display");
    const codeInput = document.getElementById("join-code-input");
    const lobbyBadge = document.getElementById("lobby-badge-text");
    const lobbySub = document.getElementById("lobby-sub-text");
    const nameInput = document.getElementById("player-name-input");

    if (joinCode && joinCode.length >= 4) {
      joinCode = joinCode.toUpperCase();
      this.invitedCode = joinCode;

      if (codeInput) {
        codeInput.value = joinCode;
      }
      if (directCodeDisplay) {
        directCodeDisplay.textContent = joinCode;
      }
      if (lobbyBadge) {
        lobbyBadge.textContent = "⚔️ INVITATION TO DUEL";
      }
      if (lobbySub) {
        lobbySub.textContent = `You have been challenged to a duel in Room ${joinCode}! Enter your codename to join.`;
      }

      // Hide CREATE ROOM & manual join box, show ONLY DIRECT JOIN
      if (defaultActions) defaultActions.classList.add("hidden");
      if (directInviteBox) directInviteBox.classList.remove("hidden");

      if (nameInput) {
        nameInput.focus();
        nameInput.placeholder = "Enter your codename...";
      }
    } else {
      // Base link opened -> show both Create Room and Join Room
      this.invitedCode = null;
      if (defaultActions) defaultActions.classList.remove("hidden");
      if (directInviteBox) directInviteBox.classList.add("hidden");
    }
  }

  // 2. Persistent Session Inspection
  checkStoredSession() {
    try {
      const raw = localStorage.getItem("number_duel_session");
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored.game_id && stored.player_id && stored.session_token) {
          this.session = stored;
          const banner = document.getElementById("resume-banner");
          const codeText = document.getElementById("resume-code-text");
          if (banner && codeText) {
            codeText.textContent = stored.game_code || "";
            banner.classList.remove("hidden");
          }
        }
      }
    } catch (e) {
      console.warn("Could not check local storage session:", e);
    }
  }

  saveSession(sessionData) {
    this.session = sessionData;
    localStorage.setItem("number_duel_session", JSON.stringify(sessionData));
  }

  clearSession() {
    this.session = null;
    localStorage.removeItem("number_duel_session");
  }

  // 3. WebSocket Event Registration
  initSocketEvents() {
    gameSocket.onStatusChange((status, text) => {
      const badge = document.getElementById("connection-badge");
      const textEl = document.getElementById("connection-text");
      if (badge && textEl) {
        badge.className = `connection-badge status-${status}`;
        textEl.textContent = text;
      }
    });

    gameSocket.on("STATE_UPDATE", (data) => {
      this.gameState = data;
      ui.render(data, this.session?.player_id);
      this.syncPinBoxes();
    });

    gameSocket.on("CHAT_MESSAGE", (msg) => {
      if (this.gameState) {
        this.gameState.chat_messages.push(msg);
        ui.renderChatMessages(this.gameState.chat_messages, this.session?.player_id);

        const chatCard = document.getElementById("sec-chat");
        if (chatCard && chatCard.classList.contains("is-collapsed") && msg.player_id !== this.session?.player_id) {
          const chatBadge = document.getElementById("nav-chat-badge");
          if (chatBadge) {
            const count = parseInt(chatBadge.textContent || "0") + 1;
            chatBadge.textContent = count;
            chatBadge.classList.remove("hidden");
          }
        }
      }
    });

    gameSocket.on("TYPING_STATUS", (data) => {
      ui.setTyping(data.player_name, data.is_typing);
    });

    gameSocket.on("ERROR", (err) => {
      showToast(err.message || "An error occurred.", "error");
    });
  }

  // 4. Bind DOM and Keyboard Events
  bindEvents() {
    // Create Game
    document.getElementById("create-game-btn")?.addEventListener("click", () => this.handleCreateGame());

    // Join Game
    document.getElementById("join-game-btn")?.addEventListener("click", () => this.handleJoinGame());

    // Direct Join from Room Invite Link
    document.getElementById("direct-join-btn")?.addEventListener("click", () => this.handleJoinGame());

    // Switch from invite view back to create view if requested
    document.getElementById("switch-to-create-btn")?.addEventListener("click", () => {
      this.invitedCode = null;
      document.getElementById("lobby-default-actions")?.classList.remove("hidden");
      document.getElementById("lobby-invite-direct")?.classList.add("hidden");
      const lobbyBadge = document.getElementById("lobby-badge-text");
      if (lobbyBadge) lobbyBadge.textContent = "ONLINE 2-PLAYER MATCH";
      const lobbySub = document.getElementById("lobby-sub-text");
      if (lobbySub) lobbySub.textContent = "Privately choose a secret number. Outsmart and decode your opponent's number before they crack yours.";
    });

    // Enter key on codename input triggers join if in invite mode, or creates game if default
    document.getElementById("player-name-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        if (this.invitedCode) {
          this.handleJoinGame();
        } else {
          this.handleCreateGame();
        }
      }
    });

    // Enter key on room code input triggers join
    document.getElementById("join-code-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.handleJoinGame();
      }
    });

    // Rejoin from banner
    document.getElementById("resume-btn")?.addEventListener("click", () => this.handleResumeGame());
    document.getElementById("discard-session-btn")?.addEventListener("click", () => {
      this.clearSession();
      document.getElementById("resume-banner")?.classList.add("hidden");
    });

    // Copy Code & Invite Link
    const copyCodeHandler = () => {
      if (this.gameState?.game_code) {
        navigator.clipboard.writeText(this.gameState.game_code);
        showToast(`Room code ${this.gameState.game_code} copied!`, "success");
      }
    };
    document.getElementById("copy-code-btn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      copyCodeHandler();
    });
    document.querySelector(".room-code-tag")?.addEventListener("click", copyCodeHandler);

    document.getElementById("copy-link-btn")?.addEventListener("click", () => {
      this.copyInviteLink();
    });

    document.getElementById("copy-share-input-btn")?.addEventListener("click", () => {
      this.copyInviteLink();
    });

    document.getElementById("quick-copy-invite-btn")?.addEventListener("click", () => {
      this.copyInviteLink();
    });

    // Go Back One Step Buttons
    document.getElementById("header-back-btn")?.addEventListener("click", () => {
      this.handleGoBackOneStep();
    });

    // Share Room Link Button
    document.getElementById("header-share-btn")?.addEventListener("click", () => {
      this.copyInviteLink();
    });

    // Rules / Instructions Overlay Buttons
    document.getElementById("header-rules-btn")?.addEventListener("click", () => {
      ui.showInstructionsOverlay();
    });
    document.getElementById("close-instructions-btn")?.addEventListener("click", () => {
      ui.hideInstructionsOverlay();
    });
    document.getElementById("dismiss-instructions-btn")?.addEventListener("click", () => {
      ui.hideInstructionsOverlay();
    });

    // Leave Game
    document.getElementById("leave-game-btn")?.addEventListener("click", () => {
      if (confirm("Are you sure you want to leave this duel?")) {
        gameSocket.disconnect();
        this.clearSession();
        window.location.href = "/";
      }
    });

    // Length Selection Buttons (3, 4, 5, 6)
    document.querySelectorAll(".length-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const length = parseInt(btn.dataset.length);
        this.handleSelectLength(length);
      });
    });

    // Secret Keypad buttons
    document.querySelectorAll("#stage-secret .key-btn[data-key]").forEach(btn => {
      btn.addEventListener("click", () => this.handleSecretKey(btn.dataset.key));
    });
    document.getElementById("secret-del-btn")?.addEventListener("click", () => this.handleSecretDelete());
    document.getElementById("secret-clear-btn")?.addEventListener("click", () => this.handleSecretClear());
    document.getElementById("submit-secret-btn")?.addEventListener("click", () => this.handleSubmitSecret());

    // Guess Keypad buttons
    document.querySelectorAll("#stage-duel .guess-key[data-key]").forEach(btn => {
      btn.addEventListener("click", () => this.handleGuessKey(btn.dataset.key));
    });
    document.getElementById("guess-del-btn")?.addEventListener("click", () => this.handleGuessDelete());
    document.getElementById("guess-clear-btn")?.addEventListener("click", () => this.handleGuessClear());
    document.getElementById("submit-guess-btn")?.addEventListener("click", () => this.handleSubmitGuess());

    // Physical Keyboard navigation
    document.addEventListener("keydown", (e) => this.handlePhysicalKeyboard(e));

    // Guess History Tabs
    document.getElementById("tab-my-guesses")?.addEventListener("click", () => {
      ui.activeHistoryTab = "my";
      document.getElementById("tab-my-guesses")?.classList.add("active");
      document.getElementById("tab-opp-guesses")?.classList.remove("active");
      if (this.gameState) ui.renderHistory(this.gameState, this.session?.player_id);
    });

    document.getElementById("tab-opp-guesses")?.addEventListener("click", () => {
      ui.activeHistoryTab = "opp";
      document.getElementById("tab-opp-guesses")?.classList.add("active");
      document.getElementById("tab-my-guesses")?.classList.remove("active");
      if (this.gameState) ui.renderHistory(this.gameState, this.session?.player_id);
    });

    // Rematch & New Game
    document.getElementById("rematch-btn")?.addEventListener("click", () => {
      if (gameSocket.ws && gameSocket.ws.readyState === WebSocket.OPEN) {
        gameSocket.send("REMATCH", {});
      } else if (this.gameState) {
        const me = this.gameState.player_1;
        const opp = this.gameState.player_2;
        if (me) { me.ready = false; me.number_length = null; }
        if (opp) { opp.ready = false; opp.number_length = null; opp.secret_number = null; }
        this.gameState.status = "CHOOSING_NUMBER_LENGTH";
        this.gameState.guesses = [];
        this.secretInputDigits = [];
        this.guessInputDigits = [];
        document.getElementById("stage-victory")?.classList.add("hidden");
        ui.render(this.gameState, this.session?.player_id);
        this.syncPinBoxes();
        showToast("Starting rematch! Choose your secret number length.", "info");
      }
    });

    document.getElementById("new-game-btn")?.addEventListener("click", () => {
      this.clearSession();
      document.getElementById("stage-victory")?.classList.add("hidden");
      document.getElementById("game-container")?.classList.add("hidden");
      document.getElementById("lobby-screen")?.classList.remove("hidden");
    });

    // Chat Form Submit
    document.getElementById("chat-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.handleSendChat();
    });

    // Chat Typing listener
    const chatInput = document.getElementById("chat-input");
    chatInput?.addEventListener("input", () => this.handleTyping());

    // Emoji Picker Toggle
    const emojiToggle = document.getElementById("emoji-toggle-btn");
    const emojiPicker = document.getElementById("emoji-picker");
    const emojiGrid = document.getElementById("emoji-grid");

    if (emojiToggle && emojiPicker && emojiGrid) {
      initEmojiPicker(emojiPicker, emojiGrid, (emoji) => {
        if (chatInput) {
          chatInput.value += emoji;
          chatInput.focus();
        }
      });

      emojiToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle("hidden");
      });

      document.addEventListener("click", (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiToggle) {
          emojiPicker.classList.add("hidden");
        }
      });
    }

    // WebRTC Buttons
    document.getElementById("webrtc-call-btn")?.addEventListener("click", () => {
      this.webrtc.requestCall("video");
    });

    document.getElementById("webrtc-audio-btn")?.addEventListener("click", () => {
      this.webrtc.requestCall("audio");
    });

    document.getElementById("header-video-btn")?.addEventListener("click", () => {
      this.webrtc.requestCall("video");
    });

    document.getElementById("header-audio-btn")?.addEventListener("click", () => {
      this.webrtc.requestCall("audio");
    });

    document.getElementById("toggle-mic-btn")?.addEventListener("click", () => {
      this.webrtc.toggleMicrophone();
    });

    document.getElementById("toggle-cam-btn")?.addEventListener("click", () => {
      this.webrtc.toggleCamera();
    });

    document.getElementById("hangup-call-btn")?.addEventListener("click", () => {
      this.webrtc.endCall(true);
    });

    // Adaptive Section Collapsing & Dock Controls
    this.initSectionCollapsing();
  }

  // Adaptive Section Management
  initSectionCollapsing() {
    // 1. Collapsible Card Headers
    document.querySelectorAll(".card-collapse-header").forEach(header => {
      header.addEventListener("click", () => {
        const secId = header.getAttribute("data-collapse");
        this.toggleSection(secId);
      });
    });

    // 2. Adaptive Pill Navigation Buttons
    document.querySelectorAll(".adaptive-pill-btn[data-target-sec]").forEach(btn => {
      btn.addEventListener("click", () => {
        const secId = btn.getAttribute("data-target-sec");
        const targetEl = document.getElementById(secId);
        if (!targetEl) return;

        const isPhone = document.querySelector(".phone-frame") || window.innerWidth <= 768;
        if (isPhone) {
          // If already in target tab and not collapsed, allow toggle; otherwise expand and scroll into view
          const wasCollapsed = targetEl.classList.contains("is-collapsed");
          if (wasCollapsed) {
            targetEl.classList.remove("is-collapsed");
            document.querySelectorAll(".adaptive-pill-btn[data-target-sec]").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
          } else if (secId === "sec-arena") {
            // Arena always stays expanded in mobile
            btn.classList.add("active");
          } else {
            targetEl.classList.add("is-collapsed");
            btn.classList.remove("active");
            document.getElementById("nav-btn-arena")?.classList.add("active");
          }
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          // Desktop toggle
          if (targetEl.classList.contains("is-collapsed")) {
            targetEl.classList.remove("is-collapsed");
            btn.classList.add("active");
          } else {
            targetEl.classList.add("is-collapsed");
            btn.classList.remove("active");
          }
        }

        // Clear chat unread badge if opening chat
        if (secId === "sec-chat") {
          const chatBadge = document.getElementById("nav-chat-badge");
          if (chatBadge) {
            chatBadge.classList.add("hidden");
            chatBadge.textContent = "0";
          }
        }
      });
    });

    // 3. Focus Arena Mode
    document.getElementById("focus-mode-btn")?.addEventListener("click", () => {
      const layout = document.getElementById("main-layout");
      const btn = document.getElementById("focus-mode-btn");
      if (!layout || !btn) return;

      const isFocus = layout.classList.toggle("focus-mode");
      btn.classList.toggle("is-active", isFocus);

      if (isFocus) {
        // Collapse sidebars in focus mode
        document.getElementById("sec-players")?.classList.add("is-collapsed");
        document.getElementById("sec-call")?.classList.add("is-collapsed");
        document.getElementById("nav-btn-players")?.classList.remove("active");
        document.getElementById("nav-btn-call")?.classList.remove("active");
        showToast("🎯 Focus Mode activated! Arena maximized.", "info");
      } else {
        // Restore
        document.getElementById("sec-players")?.classList.remove("is-collapsed");
        document.getElementById("nav-btn-players")?.classList.add("active");
      }
    });

    // 4. Toggle All Sections Button
    document.getElementById("toggle-all-btn")?.addEventListener("click", () => {
      const allCards = Array.from(document.querySelectorAll(".collapsible-card"));
      const anyCollapsed = allCards.some(card => card.classList.contains("is-collapsed"));
      const toggleText = document.getElementById("toggle-all-text");
      const toggleIcon = document.getElementById("toggle-all-icon");

      allCards.forEach(card => {
        if (anyCollapsed) {
          card.classList.remove("is-collapsed");
        } else {
          card.classList.add("is-collapsed");
        }
      });

      // Update pill buttons
      document.querySelectorAll(".adaptive-pill-btn[data-target-sec]").forEach(btn => {
        btn.classList.toggle("active", anyCollapsed);
      });

      if (toggleText && toggleIcon) {
        toggleText.textContent = anyCollapsed ? "Collapse All" : "Expand All";
        toggleIcon.textContent = anyCollapsed ? "⊟" : "⊞";
      }
    });

    // 5. On-Screen Numpad Toggle
    document.getElementById("toggle-keypad-btn")?.addEventListener("click", () => {
      const wrap = document.getElementById("guess-keypad-wrap");
      const text = document.getElementById("keypad-toggle-text");
      if (!wrap) return;

      const isHidden = wrap.classList.toggle("is-hidden");
      if (text) {
        text.textContent = isHidden ? "Show Keypad" : "Hide Keypad";
      }
    });
  }

  toggleSection(secId) {
    const el = document.getElementById(secId);
    if (!el) return;

    const isCollapsed = el.classList.toggle("is-collapsed");
    const pillBtn = document.querySelector(`.adaptive-pill-btn[data-target-sec="${secId}"]`);
    if (pillBtn) {
      pillBtn.classList.toggle("active", !isCollapsed);
    }

    // If chat opened, clear unread badge
    if (secId === "sec-chat" && !isCollapsed) {
      const chatBadge = document.getElementById("nav-chat-badge");
      if (chatBadge) {
        chatBadge.classList.add("hidden");
        chatBadge.textContent = "0";
      }
    }
  }

  async copyInviteLink() {
    const code = this.gameState?.game_code || document.getElementById("display-game-code")?.textContent?.trim();
    if (code && code !== "------") {
      const base = (window.location.origin && window.location.origin !== "null")
        ? window.location.origin
        : window.location.href.split("?")[0].split("#")[0];
      const shareUrl = `${base}?join=${code}`;
      const shareData = {
        title: "Join my Number Duel Game!",
        text: `Play 1v1 Number Duel with me! Room Code: ${code}`,
        url: shareUrl
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
          return;
        } catch (err) {
          if (err.name === "AbortError") {
            return; // User cancelled the share dialog
          }
          console.warn("Native share failed, falling back to clipboard:", err);
        }
      }

      try {
        await navigator.clipboard.writeText(shareUrl);
        showToast("Room invite link copied to clipboard! Send it to your friend.", "success");
      } catch (err) {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        showToast("Room invite link copied to clipboard! Send it to your friend.", "success");
      }
    } else {
      showToast("Room code not ready yet.", "warning");
    }
  }

  // 5. Create Game Request
  async handleCreateGame() {
    const nameInput = document.getElementById("player-name-input");
    const name = nameInput?.value.trim() || "Vinay";

    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_name: name })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Could not create game.");
      }

      const data = await res.json();
      this.saveSession({
        game_id: data.game_id,
        game_code: data.game_code,
        player_id: data.player_id,
        session_token: data.session_token
      });

      this.enterGameRoom();
    } catch (err) {
      console.warn("Backend not reachable or running in static view. Launching preview duel mode:", err);
      this.startLocalDemoGame(name);
    }
  }

  // 6. Join Game Request
  async handleJoinGame() {
    const nameInput = document.getElementById("player-name-input");
    const codeInput = document.getElementById("join-code-input");
    const name = nameInput?.value.trim() || "Player";
    const code = (this.invitedCode || codeInput?.value || "").trim().toUpperCase();

    if (!code || code.length < 4) {
      showToast("Please enter a valid game code.", "error");
      return;
    }

    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_code: code, player_name: name })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Could not join game.");
      }

      const data = await res.json();
      this.saveSession({
        game_id: data.game_id,
        game_code: data.game_code,
        player_id: data.player_id,
        session_token: data.session_token
      });

      this.enterGameRoom();
    } catch (err) {
      console.warn("Backend not reachable or running in static view. Joining preview duel mode:", err);
      this.startLocalDemoGame(name, code, false);
    }
  }

  // Local Standalone Game Simulator for UI testing & direct file viewing
  startLocalDemoGame(playerName, roomCode, isHost = true) {
    const code = roomCode || "VN" + Math.floor(1000 + Math.random() * 9000);
    const myId = isHost ? "p1_demo" : "p2_demo";

    this.session = {
      game_id: "demo_" + Date.now(),
      game_code: code,
      player_id: myId,
      session_token: "demo_token"
    };
    this.saveSession(this.session);

    this.gameState = {
      game_id: this.session.game_id,
      game_code: code,
      status: "CHOOSING_NUMBER_LENGTH",
      current_turn: myId,
      is_my_turn: true,
      winner_player_id: null,
      required_guess_length: 4,
      player_1: {
        player_id: "p1_demo",
        name: isHost ? playerName : "Vinay (Host)",
        connected: true,
        number_length: null,
        ready: false
      },
      player_2: {
        player_id: "p2_demo",
        name: isHost ? "Challenger" : playerName,
        connected: true,
        number_length: null,
        ready: false
      },
      guesses: [],
      chat_messages: [
        {
          id: "msg_1",
          player_id: "system",
          player_name: "System",
          text: `Welcome to Duel Room ${code}! Select secret number length to begin.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]
    };

    // Transition UI from lobby to game screen
    document.getElementById("lobby-screen")?.classList.add("hidden");
    document.getElementById("game-container")?.classList.remove("hidden");
    this.prepareMobileLayout();

    ui.render(this.gameState, myId);
    this.syncPinBoxes();
    showToast(`Welcome, ${playerName}! Room ${code} ready.`, "success");
  }

  prepareMobileLayout() {
    const isPhone = document.querySelector(".phone-frame") || window.innerWidth <= 768;
    if (isPhone) {
      document.getElementById("sec-players")?.classList.add("is-collapsed");
      document.getElementById("sec-hud")?.classList.add("is-collapsed");
      document.getElementById("sec-call")?.classList.add("is-collapsed");
      document.querySelectorAll(".adaptive-pill-btn[data-target-sec]").forEach(b => b.classList.remove("active"));
      document.getElementById("nav-btn-arena")?.classList.add("active");
    }
  }

  // 7. Resume Existing Session
  async handleResumeGame() {
    if (!this.session) return;
    try {
      const res = await fetch("/api/reconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_id: this.session.game_id,
          player_id: this.session.player_id,
          session_token: this.session.session_token
        })
      });

      if (!res.ok) {
        this.clearSession();
        document.getElementById("resume-banner")?.classList.add("hidden");
        throw new Error("Previous session expired or invalid.");
      }

      this.enterGameRoom();
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  enterGameRoom() {
    document.getElementById("lobby-screen")?.classList.add("hidden");
    document.getElementById("game-container")?.classList.remove("hidden");
    this.prepareMobileLayout();

    // Connect WebSocket
    gameSocket.connect(this.session.game_id, this.session.player_id, this.session.session_token);
  }

  // Go Back One Step Handlers
  handleGoBackOneStep() {
    // 0. If instructions overlay is open, close it
    const instrModal = document.getElementById("instructions-modal");
    if (instrModal && !instrModal.classList.contains("hidden")) {
      ui.hideInstructionsOverlay();
      return;
    }

    // 1. If in Step 2 (secret entry), return to Step 1 (length selection)
    const secretStage = document.getElementById("stage-secret");
    if (secretStage && !secretStage.classList.contains("hidden")) {
      this.handleGoBackToLength();
      return;
    }

    // 2. If in Step 1 or waiting room, return to codename lobby screen
    if (confirm("Go back to lobby?")) {
      this.returnToLobby();
    }
  }

  handleGoBackToLength() {
    this.secretInputDigits = [];
    this.selectedLength = null;
    if (this.gameState) {
      const me = this.gameState.player_1?.player_id === this.session?.player_id ? this.gameState.player_1 : this.gameState.player_2;
      if (me) {
        me.number_length = null;
        me.ready = false;
        me.secret_number = null;
      }
      this.gameState.status = "CHOOSING_NUMBER_LENGTH";
      ui.render(this.gameState, this.session?.player_id);
      showToast("Returned to Step 1: Choose Number Length", "info");
    }
  }

  returnToLobby() {
    if (gameSocket.ws) {
      gameSocket.disconnect();
    }
    this.clearSession();
    document.getElementById("game-container")?.classList.add("hidden");
    document.getElementById("lobby-screen")?.classList.remove("hidden");
    showToast("Returned to lobby", "info");
  }

  // 8. Length Selection (Screen 2 -> Screen 3 Transition)
  handleSelectLength(length) {
    this.selectedLength = length;
    const me = this.gameState?.player_1?.player_id === this.session?.player_id ? this.gameState?.player_1 : this.gameState?.player_2;
    if (me) me.number_length = length;

    this.secretInputDigits = [];
    this.syncPinBoxes();

    if (gameSocket.ws && gameSocket.ws.readyState === WebSocket.OPEN) {
      gameSocket.send("SELECT_LENGTH", { length });
    }

    // Immediately render UI to transition to Screen 3 (Entering Secret Number)
    if (this.gameState) {
      ui.render(this.gameState, this.session?.player_id);
    } else {
      document.getElementById("stage-length")?.classList.add("hidden");
      document.getElementById("stage-secret")?.classList.remove("hidden");
    }
    showToast(`Step 2: Enter your ${length}-digit secret number`, "info");
  }

  // 9. Secret Number Entry
  handleSecretKey(digit) {
    const me = this.gameState?.player_1?.player_id === this.session?.player_id ? this.gameState?.player_1 : this.gameState?.player_2;
    const maxLen = me?.number_length || this.selectedLength || 4;

    if (this.secretInputDigits.length < maxLen) {
      this.secretInputDigits.push(digit);
      this.syncPinBoxes();
    }
  }

  handleSecretDelete() {
    if (this.secretInputDigits.length > 0) {
      this.secretInputDigits.pop();
      this.syncPinBoxes();
    }
  }

  handleSecretClear() {
    this.secretInputDigits = [];
    this.syncPinBoxes();
  }

  handleSubmitSecret() {
    const me = this.gameState?.player_1?.player_id === this.session?.player_id ? this.gameState?.player_1 : this.gameState?.player_2;
    const opp = this.gameState?.player_1?.player_id === this.session?.player_id ? this.gameState?.player_2 : this.gameState?.player_1;
    const requiredLen = me?.number_length || this.selectedLength || 4;

    if (this.secretInputDigits.length !== requiredLen) {
      showToast(`Secret number must have exactly ${requiredLen} digits.`, "error");
      return;
    }

    const secretStr = this.secretInputDigits.join("");
    if (me) {
      me.ready = true;
      me.secret_number = secretStr;
    }

    if (gameSocket.ws && gameSocket.ws.readyState === WebSocket.OPEN) {
      gameSocket.send("SUBMIT_SECRET", { secret_number: secretStr });
    } else if (this.gameState) {
      if (opp) {
        opp.ready = true;
        if (!opp.secret_number) {
          opp.secret_number = Array.from({ length: requiredLen }, () => Math.floor(Math.random() * 10)).join("");
        }
      }
      this.gameState.status = "PLAYER_1_TURN";
      this.gameState.is_my_turn = true;
      this.gameState.current_turn = this.session?.player_id;
      this.gameState.required_guess_length = opp?.number_length || requiredLen;
    }

    // Immediately trigger Instructions Overlay in proper alignment!
    ui.showInstructionsOverlay();

    if (this.gameState) {
      ui.render(this.gameState, this.session?.player_id);
      this.syncPinBoxes();
    }
    showToast("Secret number locked! Review instructions to begin.", "success");
  }

  // 10. Guess Entry
  handleGuessKey(digit) {
    if (!this.gameState?.is_my_turn) {
      showToast("It is not your turn to guess.", "info");
      return;
    }

    const requiredLen = this.gameState?.required_guess_length || 4;
    if (this.guessInputDigits.length < requiredLen) {
      this.guessInputDigits.push(digit);
      this.syncPinBoxes();
    }
  }

  handleGuessDelete() {
    if (this.guessInputDigits.length > 0) {
      this.guessInputDigits.pop();
      this.syncPinBoxes();
    }
  }

  handleGuessClear() {
    this.guessInputDigits = [];
    this.syncPinBoxes();
  }

  handleSubmitGuess() {
    if (!this.gameState?.is_my_turn) {
      showToast("It is not your turn.", "error");
      return;
    }

    const requiredLen = this.gameState?.required_guess_length || 4;
    if (this.guessInputDigits.length !== requiredLen) {
      showToast(`Guess must contain exactly ${requiredLen} digits.`, "error");
      return;
    }

    const guessStr = this.guessInputDigits.join("");
    this.guessInputDigits = [];
    this.syncPinBoxes();

    if (gameSocket.ws && gameSocket.ws.readyState === WebSocket.OPEN) {
      gameSocket.send("SUBMIT_GUESS", { guess: guessStr });
    } else if (this.gameState) {
      const me = this.gameState.player_1?.player_id === this.session?.player_id ? this.gameState.player_1 : this.gameState.player_2;
      const opp = this.gameState.player_1?.player_id === this.session?.player_id ? this.gameState.player_2 : this.gameState.player_1;
      const secret = opp?.secret_number || "1234";

      // Two-pass Wordle matching
      const secretChars = secret.split("");
      const guessChars = guessStr.split("");
      const res = Array(guessChars.length).fill("RED");
      let greens = 0;

      for (let i = 0; i < guessChars.length; i++) {
        if (guessChars[i] === secretChars[i]) {
          res[i] = "GREEN";
          secretChars[i] = null;
          greens++;
        }
      }
      for (let i = 0; i < guessChars.length; i++) {
        if (res[i] !== "GREEN") {
          const idx = secretChars.indexOf(guessChars[i]);
          if (idx !== -1) {
            res[i] = "YELLOW";
            secretChars[idx] = null;
          }
        }
      }

      const guessObj = {
        id: "g_" + Date.now(),
        player_id: this.session?.player_id,
        player_name: me?.name || "You",
        guess: guessStr,
        feedback: res,
        turn_number: (this.gameState.guesses?.length || 0) + 1
      };

      if (!this.gameState.guesses) this.gameState.guesses = [];
      this.gameState.guesses.unshift(guessObj);

      if (greens === secret.length) {
        this.gameState.status = "GAME_WON";
        this.gameState.winner_player_id = this.session?.player_id;
        this.gameState.winner_name = me?.name || "You";
        this.gameState.opponent_secret = secret;
        ui.render(this.gameState, this.session?.player_id);
        ui.renderVictory(this.gameState, this.session?.player_id);
        showToast("🎉 Victory! You decoded the secret number!", "success");
      } else {
        ui.render(this.gameState, this.session?.player_id);
        showToast(`Submitted: ${guessStr} (${greens} Green)`, "info");
      }
    }
  }

  // 11. Sync PIN boxes with current input buffers
  syncPinBoxes() {
    // Secret PIN boxes
    const secretRow = document.getElementById("secret-pin-boxes");
    const me = this.gameState?.player_1?.player_id === this.session?.player_id ? this.gameState?.player_1 : this.gameState?.player_2;
    const secretLen = me?.number_length || this.selectedLength || 4;

    if (secretRow) {
      secretRow.innerHTML = "";
      for (let i = 0; i < secretLen; i++) {
        const box = document.createElement("div");
        box.className = "pin-box";
        if (i < this.secretInputDigits.length) {
          box.textContent = this.secretInputDigits[i];
          box.classList.add("filled");
        } else if (i === this.secretInputDigits.length) {
          box.classList.add("active-box");
        }
        secretRow.appendChild(box);
      }
    }

    const submitSecretBtn = document.getElementById("submit-secret-btn");
    if (submitSecretBtn) {
      submitSecretBtn.disabled = this.secretInputDigits.length !== secretLen || (me && me.ready);
    }

    // Guess PIN boxes
    const guessRow = document.getElementById("guess-pin-boxes");
    const targetLen = this.gameState?.required_guess_length || 4;

    if (guessRow) {
      guessRow.innerHTML = "";
      for (let i = 0; i < targetLen; i++) {
        const box = document.createElement("div");
        box.className = "pin-box";
        if (i < this.guessInputDigits.length) {
          box.textContent = this.guessInputDigits[i];
          box.classList.add("filled");
        } else if (i === this.guessInputDigits.length && this.gameState?.is_my_turn) {
          box.classList.add("active-box");
        }
        guessRow.appendChild(box);
      }
    }

    const submitGuessBtn = document.getElementById("submit-guess-btn");
    if (submitGuessBtn) {
      submitGuessBtn.disabled = 
        !this.gameState?.is_my_turn || 
        this.guessInputDigits.length !== targetLen ||
        this.gameState?.status === "GAME_WON";
    }
  }

  // 12. Physical Keyboard Support
  handlePhysicalKeyboard(e) {
    // If user is focused on chat input, don't intercept digits
    if (document.activeElement?.id === "chat-input" || document.activeElement?.id === "player-name-input" || document.activeElement?.id === "join-code-input") {
      return;
    }

    const status = this.gameState?.status;

    // Number keys 0-9
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      if (status === "WAITING_FOR_SECRET_NUMBERS" || (status === "CHOOSING_NUMBER_LENGTH" && this.selectedLength)) {
        this.handleSecretKey(e.key);
      } else if (status === "PLAYER_1_TURN" || status === "PLAYER_2_TURN") {
        this.handleGuessKey(e.key);
      }
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      if (status === "WAITING_FOR_SECRET_NUMBERS" || (status === "CHOOSING_NUMBER_LENGTH" && this.selectedLength)) {
        this.handleSecretDelete();
      } else if (status === "PLAYER_1_TURN" || status === "PLAYER_2_TURN") {
        this.handleGuessDelete();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (status === "WAITING_FOR_SECRET_NUMBERS") {
        this.handleSubmitSecret();
      } else if (status === "PLAYER_1_TURN" || status === "PLAYER_2_TURN") {
        this.handleSubmitGuess();
      }
    }
  }

  // 13. Chat Actions
  handleSendChat() {
    const input = document.getElementById("chat-input");
    const text = input?.value.trim();
    if (!text) return;

    if (gameSocket.ws && gameSocket.ws.readyState === WebSocket.OPEN) {
      gameSocket.send("SEND_CHAT", { message: text });
    } else if (this.gameState) {
      const me = this.gameState.player_1?.player_id === this.session?.player_id ? this.gameState.player_1 : this.gameState.player_2;
      if (!this.gameState.chat_messages) this.gameState.chat_messages = [];
      this.gameState.chat_messages.push({
        id: "msg_" + Date.now(),
        player_id: this.session?.player_id || "p1_demo",
        player_name: me?.name || "You",
        text: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      ui.renderChatMessages(this.gameState.chat_messages, this.session?.player_id);
    }

    input.value = "";

    // Clear typing
    if (this.isTypingSent) {
      if (gameSocket.ws && gameSocket.ws.readyState === WebSocket.OPEN) {
        gameSocket.send("TYPING", { is_typing: false });
      }
      this.isTypingSent = false;
    }
  }

  handleTyping() {
    if (!this.isTypingSent) {
      gameSocket.send("TYPING", { is_typing: true });
      this.isTypingSent = true;
    }
    clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => {
      gameSocket.send("TYPING", { is_typing: false });
      this.isTypingSent = false;
    }, 2500);
  }
}

// Start app on DOMContentLoaded
window.addEventListener("DOMContentLoaded", () => {
  const app = new AppController();
  app.init();
});
