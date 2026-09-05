// src/services/websocket.js
// Enterprise SOC Near-Real-Time Telemetry Event Stream

import { INITIAL_LIVE_EVENTS } from '../utils/mockData';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/telemetry';

class TelemetryWebSocketService {
  constructor() {
    this.wsUrl = WS_URL;
    this.socket = null;
    this.status = 'DISCONNECTED'; // 'LIVE' | 'RECONNECTING' | 'DISCONNECTED'
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.mockInterval = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this._setStatus('RECONNECTING');

    try {
      this.socket = new WebSocket(this.wsUrl);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this._setStatus('LIVE');
        this._stopMockStream();
      };

      this.socket.onmessage = (event) => {
        try {
          const telemetryData = JSON.parse(event.data);
          this._notifyListeners(telemetryData);
        } catch (e) {
          console.error('Error parsing telemetry payload', e);
        }
      };

      this.socket.onerror = () => {
        // Will trigger onclose
      };

      this.socket.onclose = () => {
        this._handleDisconnect();
      };
    } catch (e) {
      this._handleDisconnect();
    }
  }

  _handleDisconnect() {
    this.socket = null;
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this._setStatus('RECONNECTING');
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    } else {
      this._setStatus('LIVE (SIMULATED)');
      this._startMockStream();
    }
  }

  _setStatus(newStatus) {
    this.status = newStatus;
    this.statusListeners.forEach((callback) => callback(newStatus));
  }

  _notifyListeners(eventData) {
    this.listeners.forEach((callback) => callback(eventData));
  }

  // Subscribe to telemetry events
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // Subscribe to connection status changes (LIVE, RECONNECTING, DISCONNECTED)
  subscribeStatus(callback) {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  // Fallback simulator for realistic background telemetry
  _startMockStream() {
    if (this.mockInterval) return;

    let index = 0;
    const sampleEvents = [
      {
        id: `EVT-${Date.now() + 1}`,
        timestamp: 'Just now',
        severity: 'LOW',
        title: 'Routine biometric verification cleared for executive trunk',
        target: 'Legal Operations (ext 304)',
        claimedIdentity: 'Sarah Jenkins (CLO)',
        riskScore: 14,
        syntheticProbability: 0.03,
        speakerStatus: 'VERIFIED',
        intent: 'NORMAL_CONVERSATION',
        channel: 'SIP-Trunk-01',
        status: 'CLEARED'
      },
      {
        id: `EVT-${Date.now() + 2}`,
        timestamp: 'Just now',
        severity: 'MEDIUM',
        title: 'High pitch variance and GSM codec compression detected',
        target: 'Customer Accounts Support',
        claimedIdentity: 'External Mobile Inbound',
        riskScore: 48,
        syntheticProbability: 0.42,
        speakerStatus: 'NOT AVAILABLE',
        intent: 'PAYMENT_TRANSFER',
        channel: 'VoIP-GW-02',
        status: 'ANALYZING'
      },
      {
        id: `EVT-${Date.now() + 3}`,
        timestamp: 'Just now',
        severity: 'CRITICAL',
        title: 'Potential AI-cloned executive impersonation detected',
        target: 'Treasury Wire Desk',
        claimedIdentity: 'Elena Rostova (CFO)',
        riskScore: 94,
        syntheticProbability: 0.93,
        speakerStatus: 'IDENTITY MISMATCH',
        intent: 'PAYMENT_TRANSFER',
        channel: 'PBX-Trunk-02',
        status: 'INCIDENT_CREATED',
        incidentId: 'INC-2026-00142'
      }
    ];

    this.mockInterval = setInterval(() => {
      const template = sampleEvents[index % sampleEvents.length];
      const newEvent = {
        ...template,
        id: `EVT-${Date.now().toString().slice(-5)}`,
        timestamp: 'Just now'
      };
      this._notifyListeners(newEvent);
      index++;
    }, 12000); // Send an event every 12 seconds
  }

  _stopMockStream() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this._stopMockStream();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this._setStatus('DISCONNECTED');
  }
}

export const wsService = new TelemetryWebSocketService();
