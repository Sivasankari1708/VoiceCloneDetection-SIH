// src/services/websocket.js
// VoiceShield Enterprise SOC Near-Real-Time Alert Stream
// Pure WebSocket client for FastAPI /ws/org/{org_id}/alerts - zero mock data.

const DEFAULT_WS_BASE =
  (import.meta.env.VITE_WS_URL || 'ws://localhost:8000').replace(/^http/, 'ws').replace(/\/$/, '');

class TelemetryWebSocketService {
  constructor() {
    this.socket = null;
    this.status = 'DISCONNECTED'; // LIVE | RECONNECTING | DISCONNECTED

    this.listeners = new Set();
    this.statusListeners = new Set();

    this.reconnectTimer = null;
    this.keepAliveTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.shouldReconnect = true;
  }

  getWsUrl() {
    // If exact full URL supplied via env (e.g. ws://localhost:8000/ws/org/org_demo_001/alerts)
    if (import.meta.env.VITE_WS_URL && import.meta.env.VITE_WS_URL.includes('/ws/')) {
      return import.meta.env.VITE_WS_URL;
    }

    let orgId = 'org_demo_001';
    try {
      const rawUser = sessionStorage.getItem('voiceshield_user');
      if (rawUser) {
        const user = JSON.parse(rawUser);
        if (user?.org_id) orgId = user.org_id;
      }
    } catch {
      // ignore
    }

    return `${DEFAULT_WS_BASE}/ws/org/${orgId}/alerts`;
  }

  // ============================================================
  // CONNECT
  // ============================================================

  connect() {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.shouldReconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this._setStatus('RECONNECTING');

    const wsUrl = this.getWsUrl();
    console.info('[WebSocket] Connecting to:', wsUrl);

    try {
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.info('[WebSocket] Connected successfully to telemetry feed.');
        this.reconnectAttempts = 0;
        this._setStatus('LIVE');
        this._startKeepAlive();
      };

      this.socket.onmessage = (event) => {
        this._handleMessage(event);
      };

      this.socket.onerror = (error) => {
        console.warn('[WebSocket] Connection warning/error:', error);
      };

      this.socket.onclose = (event) => {
        console.info(`[WebSocket] Closed (code=${event.code}).`);
        this._stopKeepAlive();
        this.socket = null;
        this._handleDisconnect();
      };
    } catch (error) {
      console.error('[WebSocket] Failed to establish connection:', error);
      this._handleDisconnect();
    }
  }

  // ============================================================
  // MESSAGE HANDLING
  // ============================================================

  _handleMessage(event) {
    try {
      const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      const data = parsed?.data ?? parsed;
      this._notifyListeners(this._normalizeEvent(data));
    } catch (error) {
      console.error('[WebSocket] Error processing payload:', error, event.data);
    }
  }

  _normalizeEvent(event) {
    if (!event || typeof event !== 'object') return event;

    const riskScore = Math.round(event.riskScore ?? event.risk_score ?? event.current_risk_score ?? 0);
    const severity = event.severity ?? this._riskToSeverity(riskScore);

    return {
      ...event,
      id: event.id ?? event.event_id ?? event.incident_id ?? `EVT-${Date.now()}`,
      timestamp: event.timestamp ?? event.created_at ?? 'Just now',
      severity,
      riskScore,
      syntheticProbability: event.syntheticProbability ?? event.synthetic_probability ?? (riskScore ? riskScore / 100 : null),
      claimedIdentity: typeof event.claimedIdentity === 'string'
        ? event.claimedIdentity
        : (event.claimedIdentity?.name ?? event.claimed_identity ?? 'Protected Identity'),
      target: typeof event.target === 'string'
        ? event.target
        : (event.target?.name ?? event.caller_name ?? 'Executive Desk'),
      title: event.title ?? event.scenario ?? `Live Alert: Impersonation risk detected (${riskScore})`,
      channel: event.channel ?? 'SIP-Trunk-01',
      status: event.status ?? (riskScore >= 70 ? 'OPEN' : 'CLEARED'),
      speakerStatus: event.speakerStatus ?? (event.speaker_similarity && event.speaker_similarity < 0.70 ? 'MISMATCH' : 'VERIFIED'),
      intent: event.intent ?? 'CALL_ACTIVITY'
    };
  }

  _riskToSeverity(score = 0) {
    if (score >= 85) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 30) return 'MEDIUM';
    return 'LOW';
  }

  // ============================================================
  // RECONNECT & STATUS
  // ============================================================

  _handleDisconnect() {
    this._setStatus('DISCONNECTED');

    if (!this.shouldReconnect) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts += 1;
      const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), 20000);
      console.info(`[WebSocket] Reconnecting attempt ${this.reconnectAttempts} in ${Math.round(delay)}ms...`);
      this._setStatus('RECONNECTING');

      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.warn('[WebSocket] Maximum reconnect attempts reached.');
      this._setStatus('DISCONNECTED');
    }
  }

  _setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((callback) => {
      try {
        callback(status);
      } catch (err) {
        console.error('[WebSocket] Error in status subscriber:', err);
      }
    });
  }

  // ============================================================
  // PING / KEEP-ALIVE
  // ============================================================

  _startKeepAlive() {
    this._stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        } catch {
          // ignore
        }
      }
    }, 25000);
  }

  _stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  // ============================================================
  // SUBSCRIPTIONS
  // ============================================================

  _notifyListeners(event) {
    this.listeners.forEach((callback) => {
      try {
        callback(event);
      } catch (err) {
        console.error('[WebSocket] Error in event listener:', err);
      }
    });
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  subscribeStatus(callback) {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._stopKeepAlive();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this._setStatus('DISCONNECTED');
  }
}

export const wsService = new TelemetryWebSocketService();