/**
 * WebRTC Audio & Video Peer-to-Peer Manager.
 * Uses WebSocket for signaling (Offer, Answer, ICE Candidates, Permission Requests).
 * Completely optional; does not interrupt gameplay if denied or unsupported.
 */

class WebRTCManager {
  constructor(socket) {
    this.socket = socket;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.isInCall = false;
    this.mediaType = "video"; // 'video' or 'audio'
    this.isMicMuted = false;
    this.isCamOff = false;

    this.rtcConfig = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    };

    this.initSignalingHandlers();
  }

  initSignalingHandlers() {
    this.socket.on("WEBRTC_REQUEST", (payload) => {
      this.handleIncomingRequest(payload);
    });

    this.socket.on("WEBRTC_RESPONSE", (payload) => {
      this.handleRequestResponse(payload);
    });

    this.socket.on("WEBRTC_OFFER", async (payload) => {
      await this.handleIncomingOffer(payload);
    });

    this.socket.on("WEBRTC_ANSWER", async (payload) => {
      await this.handleIncomingAnswer(payload);
    });

    this.socket.on("WEBRTC_ICE_CANDIDATE", async (payload) => {
      await this.handleIncomingCandidate(payload);
    });

    this.socket.on("WEBRTC_HANGUP", () => {
      this.endCall(false);
      showToast("Opponent ended the call.", "info");
    });
  }

  // 1. Initiate Call Request (Explicit User Permission Flow)
  async requestCall(mediaType = "video") {
    if (this.isInCall) return;
    this.mediaType = mediaType;
    showToast(`Requesting ${mediaType} call with opponent...`, "info");
    this.socket.send("WEBRTC_REQUEST", {
      payload: {
        media_type: mediaType
      }
    });
  }

  // 2. Opponent receives request modal
  handleIncomingRequest(payload) {
    const type = payload?.media_type || "video";
    this.mediaType = type;
    const modal = document.getElementById("media-modal");
    const icon = document.getElementById("modal-icon");
    const title = document.getElementById("modal-title");
    const desc = document.getElementById("modal-desc");
    const allowBtn = document.getElementById("modal-allow-btn");
    const denyBtn = document.getElementById("modal-deny-btn");

    icon.textContent = type === "video" ? "📹" : "🎙️";
    title.textContent = `Incoming ${type === "video" ? "Video" : "Audio"} Call`;
    desc.textContent = `Your opponent wants to start peer-to-peer ${type}. Do you allow microphone & ${type === "video" ? "camera" : "audio"} access?`;

    modal.classList.remove("hidden");

    const cleanup = () => {
      modal.classList.add("hidden");
      allowBtn.replaceWith(allowBtn.cloneNode(true));
      denyBtn.replaceWith(denyBtn.cloneNode(true));
    };

    document.getElementById("modal-allow-btn").onclick = async () => {
      cleanup();
      const started = await this.startMedia(type);
      if (started) {
        this.socket.send("WEBRTC_RESPONSE", { payload: { accepted: true, media_type: type } });
      } else {
        this.socket.send("WEBRTC_RESPONSE", { payload: { accepted: false, reason: "Device error" } });
      }
    };

    document.getElementById("modal-deny-btn").onclick = () => {
      cleanup();
      this.socket.send("WEBRTC_RESPONSE", { payload: { accepted: false, reason: "User declined" } });
      showToast("Call request declined. Match continues normally.", "info");
    };
  }

  // 3. Sender receives acceptance/denial
  async handleRequestResponse(payload) {
    if (payload?.accepted) {
      showToast("Call accepted! Initializing peer connection...", "success");
      const started = await this.startMedia(payload.media_type || this.mediaType);
      if (started) {
        await this.createAndSendOffer();
      }
    } else {
      showToast("Opponent declined the call. Game continues normally.", "info");
    }
  }

  // Acquire User Media
  async startMedia(type) {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast("WebRTC media is not supported on this browser.", "error");
        return false;
      }

      const constraints = {
        audio: true,
        video: type === "video" ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } : false
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      const localVideo = document.getElementById("local-video");
      if (localVideo) {
        localVideo.srcObject = this.localStream;
      }

      this.setupPeerConnection();
      this.isInCall = true;
      this.updateCallUI();
      return true;
    } catch (err) {
      console.warn("Media access failed:", err);
      showToast("Could not access microphone/camera. Game continues normally.", "error");
      return false;
    }
  }

  setupPeerConnection() {
    this.peerConnection = new RTCPeerConnection(this.rtcConfig);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, this.localStream);
      });
    }

    // Handle remote tracks
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      const remoteVideo = document.getElementById("remote-video");
      if (remoteVideo) {
        remoteVideo.srcObject = this.remoteStream;
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.send("WEBRTC_ICE_CANDIDATE", {
          payload: { candidate: event.candidate }
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      if (state === "disconnected" || state === "failed" || state === "closed") {
        this.endCall(false);
      }
    };
  }

  async createAndSendOffer() {
    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      this.socket.send("WEBRTC_OFFER", { payload: { sdp: offer } });
    } catch (err) {
      console.error("Error creating offer:", err);
    }
  }

  async handleIncomingOffer(payload) {
    try {
      if (!this.peerConnection) {
        await this.startMedia(this.mediaType);
      }
      if (this.peerConnection && payload?.sdp) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        this.socket.send("WEBRTC_ANSWER", { payload: { sdp: answer } });
      }
    } catch (err) {
      console.error("Error handling offer:", err);
    }
  }

  async handleIncomingAnswer(payload) {
    try {
      if (this.peerConnection && payload?.sdp) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      }
    } catch (err) {
      console.error("Error handling answer:", err);
    }
  }

  async handleIncomingCandidate(payload) {
    try {
      if (this.peerConnection && payload?.candidate) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    } catch (err) {
      console.error("Error handling ICE candidate:", err);
    }
  }

  toggleMicrophone() {
    if (!this.localStream) return;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      this.isMicMuted = !this.isMicMuted;
      audioTrack.enabled = !this.isMicMuted;
      const btn = document.getElementById("toggle-mic-btn");
      if (btn) {
        btn.classList.toggle("muted", this.isMicMuted);
        btn.textContent = this.isMicMuted ? "🔇" : "🎙️";
        btn.title = this.isMicMuted ? "Unmute Microphone" : "Mute Microphone";
      }
    }
  }

  toggleCamera() {
    if (!this.localStream) return;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      this.isCamOff = !this.isCamOff;
      videoTrack.enabled = !this.isCamOff;
      const btn = document.getElementById("toggle-cam-btn");
      if (btn) {
        btn.classList.toggle("muted", this.isCamOff);
        btn.textContent = this.isCamOff ? "🚫" : "📹";
        btn.title = this.isCamOff ? "Turn Camera On" : "Turn Camera Off";
      }
    }
  }

  endCall(notifyRemote = true) {
    if (notifyRemote && this.isInCall) {
      this.socket.send("WEBRTC_HANGUP", {});
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.isInCall = false;
    this.isMicMuted = false;
    this.isCamOff = false;

    const localVideo = document.getElementById("local-video");
    const remoteVideo = document.getElementById("remote-video");
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    this.updateCallUI();
  }

  updateCallUI() {
    const streamContainer = document.getElementById("video-stream-container");
    const activeControls = document.getElementById("active-call-controls");
    const callBadge = document.getElementById("call-status-badge");
    const initialControls = document.querySelector(".media-controls-row");

    if (this.isInCall) {
      streamContainer?.classList.remove("hidden");
      activeControls?.classList.remove("hidden");
      initialControls?.classList.add("hidden");
      if (callBadge) {
        callBadge.textContent = "Live";
        callBadge.style.color = "var(--color-green)";
        callBadge.style.background = "var(--color-green-bg)";
      }
    } else {
      streamContainer?.classList.add("hidden");
      activeControls?.classList.add("hidden");
      initialControls?.classList.remove("hidden");
      if (callBadge) {
        callBadge.textContent = "Inactive";
        callBadge.style.color = "var(--text-muted)";
        callBadge.style.background = "rgba(255, 255, 255, 0.05)";
      }
    }
  }
}
