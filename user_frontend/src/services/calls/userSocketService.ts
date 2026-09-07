// user_frontend/src/services/calls/userSocketService.ts
// Real-time personal WebSocket connection for authenticated users to receive
// incoming calls and personal security notifications.

import { config } from '../config';
import type { IncomingCallData } from '../../types';

export type UserSocketEvent =
  | { type: 'INCOMING_CALL'; data: IncomingCallData }
  | { type: 'CALL_ACCEPTED'; data: any }
  | { type: 'CALL_ENDED'; data: { session_id: string; reason?: string } };

class UserSocketService {
  private ws: WebSocket | null = null;
  private currentUserId: string | null = null;
  private listeners: Set<(event: UserSocketEvent) => void> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private shouldConnect = false;

  connect(userId: string): void {
    if (this.currentUserId === userId && this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.disconnect();
    this.currentUserId = userId;
    this.shouldConnect = true;

    const wsUrl = `${config.wsBaseUrl}/ws/user/${userId}`;
    console.info(`[UserSocket] Connecting to ${wsUrl}...`);

    try {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        console.info(`[UserSocket] Connected for user: ${userId}`);
        this.startPing();
      };

      ws.onmessage = (evt) => {
        if (typeof evt.data !== 'string') return;
        try {
          const payload = JSON.parse(evt.data) as {
            event?: string;
            type?: string;
            data?: any;
          };

          if (payload.type === 'pong') return;

          const eventName = payload.event || payload.type;
          if (eventName === 'INCOMING_CALL' && payload.data) {
            console.info('[UserSocket] INCOMING_CALL received:', payload.data);
            this.notify({ type: 'INCOMING_CALL', data: payload.data });
          } else if (eventName === 'CALL_ACCEPTED' && payload.data) {
            console.info('[UserSocket] CALL_ACCEPTED received:', payload.data);
            this.notify({ type: 'CALL_ACCEPTED', data: payload.data });
          } else if (eventName === 'CALL_ENDED' && payload.data) {
            console.info('[UserSocket] CALL_ENDED received:', payload.data);
            this.notify({ type: 'CALL_ENDED', data: payload.data });
          }
        } catch (err) {
          console.warn('[UserSocket] Error parsing message:', err);
        }
      };

      ws.onerror = (err) => {
        console.warn('[UserSocket] Socket error:', err);
      };

      ws.onclose = () => {
        console.info('[UserSocket] Connection closed.');
        this.stopPing();
        this.ws = null;
        if (this.shouldConnect) {
          this.reconnectTimer = setTimeout(() => {
            if (this.shouldConnect && this.currentUserId) {
              this.connect(this.currentUserId);
            }
          }, 3000);
        }
      };
    } catch (err) {
      console.error('[UserSocket] Failed to open WebSocket:', err);
    }
  }

  disconnect(): void {
    this.shouldConnect = false;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentUserId = null;
  }

  subscribe(listener: (event: UserSocketEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: UserSocketEvent): void {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('[UserSocket] Error in listener:', err);
      }
    });
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}

export const userSocketService = new UserSocketService();
