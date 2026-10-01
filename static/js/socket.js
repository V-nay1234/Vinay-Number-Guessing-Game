/**
 * Real-time WebSocket Client with Auto-Reconnection and Event Dispatching.
 */
class GameSocket {
  constructor() {
    this.ws = null;
    this.gameId = null;
    this.playerId = null;
    this.token = null;
    this.handlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.reconnectDelay = 1000;
    this.isManuallyClosed = false;
    this.statusListeners = [];
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }

  onStatusChange(listener) {
    this.statusListeners.push(listener);
  }

  emitStatus(status, text) {
    this.statusListeners.forEach(fn => fn(status, text));
  }

  connect(gameId, playerId, token) {
    this.gameId = gameId;
    this.playerId = playerId;
    this.token = token;
    this.isManuallyClosed = false;

    if (window.location.protocol === "file:" || !window.location.host) {
      this.emitStatus("connected", "Preview Mode");
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/${gameId}/${playerId}?token=${encodeURIComponent(token)}`;

    this.emitStatus("reconnecting", "Connecting...");

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.emitStatus("connected", "Connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const type = msg.type;
          const listeners = this.handlers.get(type) || [];
          listeners.forEach(fn => fn(msg.data, msg));
        } catch (err) {
          console.error("Failed to parse incoming WebSocket message:", err);
        }
      };

      this.ws.onclose = (event) => {
        if (!this.isManuallyClosed) {
          this.emitStatus("reconnecting", "Reconnecting...");
          this.scheduleReconnect();
        } else {
          this.emitStatus("disconnected", "Disconnected");
        }
      };

      this.ws.onerror = (err) => {
        console.warn("WebSocket error observed:", err);
      };
    } catch (err) {
      console.error("WebSocket connection failure:", err);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.isManuallyClosed) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emitStatus("disconnected", "Connection lost");
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 10000);
    setTimeout(() => {
      if (!this.isManuallyClosed && this.gameId) {
        this.connect(this.gameId, this.playerId, this.token);
      }
    }, delay);
  }

  send(action, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action, ...payload }));
      return true;
    }
    console.warn("Cannot send message, WebSocket not connected:", action);
    return false;
  }

  disconnect() {
    this.isManuallyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.emitStatus("disconnected", "Disconnected");
  }
}

const gameSocket = new GameSocket();
