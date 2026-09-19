// user_frontend/src/services/calls/callBridge.ts
// Robust, authoritative cross-tab and backend call synchronization service
// Connects the Attacker Console (/attacker) and Employee Protection Console (/live)

import { config } from '../config';
import type { IncomingCallData } from '../../types';
import { getEffectiveAuthSession } from '../auth/authStorage';
import { analyzeSensitiveSolicitation } from '../../utils/sensitiveDataDetector';

function getBridgeToken(): string | null {
  return (
    getEffectiveAuthSession().token ||
    sessionStorage.getItem('voiceshield_token') ||
    localStorage.getItem('voiceshield_token')
  );
}

export interface CallBridgeEvent {
  type:
    | 'INCOMING_CALL'
    | 'CALL_ACCEPTED'
    | 'CALL_DECLINED'
    | 'NEW_DIALOGUE'
    | 'INTERIM_DIALOGUE'
    | 'RISK_UPDATE'
    | 'CALL_ENDED';
  payload: any;
  timestamp: number;
}

export interface AttackScenarioBridgeData {
  id: string;
  title: string;
  category?: 'executive' | 'banking' | 'normal' | 'government' | 'police' | 'defense';
  claimedCaller: string;
  claimedOrgName?: string;
  claimedOrgId?: string;
  claimedSpeakerId?: string;
  callerDesignation?: string;
  description?: string;
  openingLine?: string;
  escalationLine?: string;
  attackType?: string;
  audioSource?: string;
}

class CallBridgeService {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(event: CallBridgeEvent) => void> = new Set();
  private activeSessionId: string | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel('voiceshield_call_channel');
        this.channel.onmessage = (event: MessageEvent<CallBridgeEvent>) => {
          if (event?.data?.type) {
            this.notify(event.data);
          }
        };
      } catch (err) {
        console.warn('[CallBridge] BroadcastChannel unavailable:', err);
      }
    }

    // Secondary fallback: storage event for older browsers or if BroadcastChannel is blocked
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (evt) => {
        if (evt.key === 'voiceshield_bridge_event' && evt.newValue) {
          try {
            const parsed = JSON.parse(evt.newValue) as CallBridgeEvent;
            this.notify(parsed);
          } catch {}
        }
      });
    }
  }

  public subscribe(listener: (event: CallBridgeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: CallBridgeEvent): void {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error('[CallBridge] Listener error:', err);
      }
    });
  }

  private broadcast(event: CallBridgeEvent): void {
    this.notify(event);
    if (this.channel) {
      try {
        this.channel.postMessage(event);
      } catch (err) {
        console.warn('[CallBridge] Channel post error:', err);
      }
    }
    try {
      localStorage.setItem('voiceshield_bridge_event', JSON.stringify(event));
    } catch {}
  }

  /**
   * Start a call from the attacker console to the target employee
   */
  public async startCall(
    scenario: AttackScenarioBridgeData,
    recipientId = 'user_sreya_001'
  ): Promise<{ sessionId: string }> {
    const localSessionId = `call-${Date.now()}`;
    let remoteSessionId = localSessionId;

    const claimedOrgName = scenario.claimedOrgName || 'Indian Overseas Bank';
    const claimedOrgId = scenario.claimedOrgId || 'org_iob';
    const claimedSpeakerId = scenario.claimedSpeakerId || (scenario.category === 'executive' ? 'SPK_IOB_01' : null);

    // 1. Create backend call session on FastAPI server
    try {
      const token = getBridgeToken();
      const res = await fetch(`${config.apiBaseUrl}/api/calls/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          caller_name: scenario.claimedCaller,
          caller_number: '+91 98201 44102',
          claimed_speaker_id: claimedSpeakerId,
          claimed_org_name: claimedOrgName,
          claimed_org_id: claimedOrgId,
          recipient_user_id: recipientId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.session_id) {
          remoteSessionId = data.session_id;
        }
      }
    } catch (err) {
      console.warn('[CallBridge] Backend /api/calls/start unavailable, using local bridge:', err);
    }

    this.activeSessionId = remoteSessionId;
    this.clearActiveDialogues();

    const incomingCallData: IncomingCallData = {
      session_id: remoteSessionId,
      caller_name: scenario.claimedCaller,
      claimed_speaker_id: claimedSpeakerId || undefined,
      claimed_org_name: claimedOrgName,
      claimed_org_id: claimedOrgId,
      caller_designation: scenario.callerDesignation || 'Officer',
      status: 'RINGING',
    };

    try {
      localStorage.setItem('voiceshield_active_call_meta', JSON.stringify({
        ...incomingCallData,
        scenario,
      }));
    } catch {}

    // 2. Broadcast INCOMING_CALL to all open employee tabs
    this.broadcast({
      type: 'INCOMING_CALL',
      timestamp: Date.now(),
      payload: {
        ...incomingCallData,
        scenario,
      },
    });

    return { sessionId: remoteSessionId };
  }

  /**
   * Recipient accepts incoming call
   */
  public async acceptCall(sessionId: string): Promise<void> {
    this.activeSessionId = sessionId;

    try {
      const token = getBridgeToken();
      await fetch(`${config.apiBaseUrl}/api/calls/${sessionId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {}

    try {
      const existing = localStorage.getItem('voiceshield_active_call_meta');
      if (existing) {
        const meta = JSON.parse(existing);
        meta.status = 'ACTIVE';
        localStorage.setItem('voiceshield_active_call_meta', JSON.stringify(meta));
      }
    } catch {}

    this.broadcast({
      type: 'CALL_ACCEPTED',
      timestamp: Date.now(),
      payload: { sessionId },
    });
  }

  /**
   * Recipient declines incoming call
   */
  public async declineCall(sessionId: string): Promise<void> {
    this.activeSessionId = null;

    try {
      const token = getBridgeToken();
      await fetch(`${config.apiBaseUrl}/api/calls/${sessionId}/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {}

    try {
      localStorage.removeItem('voiceshield_active_call_meta');
    } catch {}

    this.broadcast({
      type: 'CALL_DECLINED',
      timestamp: Date.now(),
      payload: { sessionId },
    });
  }

  /**
   * Send a conversation line across tabs in real-time
   */
  public sendDialogue(
    speaker: 'caller' | 'employee',
    speakerName: string,
    text: string,
    riskLevel?: 'Safe' | 'Low' | 'Caution' | 'High' | 'Critical',
    isAttack = false
  ): void {
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const analysis = analyzeSensitiveSolicitation(text, speaker);
    const resolvedLevel = analysis.isSensitive
      ? analysis.severity
      : (riskLevel || (isAttack ? 'Critical' : 'Safe'));
    const resolvedIsAttack = isAttack || analysis.isSensitive;

    const lineItem = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      speaker,
      speakerName,
      text,
      time,
      isAttack: resolvedIsAttack,
    };

    // Persist in shared storage so navigating or reloading tabs never lose conversation history
    try {
      const existing = this.getActiveDialogues();
      existing.push(lineItem);
      localStorage.setItem('voiceshield_active_dialogues', JSON.stringify(existing));
    } catch {}

    this.broadcast({
      type: 'NEW_DIALOGUE',
      timestamp: Date.now(),
      payload: {
        dialogue: lineItem,
        riskLevel: resolvedLevel,
        analysis,
      },
    });

    if (this.activeSessionId && (resolvedLevel === 'High' || resolvedLevel === 'Critical')) {
      const score = resolvedLevel === 'Critical' ? 95.0 : 78.0;
      this.syncRiskToBackend(this.activeSessionId, score, resolvedLevel.toUpperCase(), [
        analysis.isSensitive
          ? analysis.warningLabel
          : `High risk detected in dialogue: "${text.slice(0, 80)}"`,
      ]);
    }
  }

  public getActiveDialogues(): Array<{
    id: string;
    speaker: 'caller' | 'employee';
    speakerName: string;
    text: string;
    time: string;
    isAttack?: boolean;
  }> {
    try {
      const raw = localStorage.getItem('voiceshield_active_dialogues');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public clearActiveDialogues(): void {
    try {
      localStorage.removeItem('voiceshield_active_dialogues');
    } catch {}
  }

  /**
   * Broadcast instant interim speech tokens across tabs (< 5ms)
   */
  public sendInterimDialogue(speaker: 'caller' | 'employee', text: string): void {
    this.broadcast({
      type: 'INTERIM_DIALOGUE',
      timestamp: Date.now(),
      payload: {
        speaker,
        text,
      },
    });
  }

  /**
   * Update the risk state across tabs and backend
   */
  public updateRisk(level: 'Safe' | 'Low' | 'Caution' | 'High' | 'Critical', reason?: string): void {
    this.broadcast({
      type: 'RISK_UPDATE',
      timestamp: Date.now(),
      payload: {
        level,
        reason,
      },
    });

    if (this.activeSessionId) {
      const scoreMap: Record<string, number> = {
        Critical: 95.0,
        High: 78.0,
        Caution: 52.0,
        Low: 30.0,
        Safe: 10.0,
      };
      const score = scoreMap[level] ?? 10.0;
      this.syncRiskToBackend(this.activeSessionId, score, level.toUpperCase(), [reason || `Risk level set to ${level}`]);
    }
  }

  private async syncRiskToBackend(sessionId: string, riskScore: number, riskLevel: string, reasons: string[]): Promise<void> {
    try {
      const token = getBridgeToken();
      await fetch(`${config.apiBaseUrl}/api/calls/${sessionId}/report_risk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          data: {
            risk_score: riskScore,
            risk_level: riskLevel,
            reasons,
          },
        }),
      });
    } catch (err) {
      console.warn('[CallBridge] Failed to report risk to backend:', err);
    }
  }

  /**
   * Terminate active call
   */
  public async endCall(sessionId?: string): Promise<void> {
    const targetSessionId = sessionId || this.getActiveSessionId();
    this.activeSessionId = null;

    if (targetSessionId) {
      try {
        const token = getBridgeToken();
        await fetch(`${config.apiBaseUrl}/api/calls/${targetSessionId}/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ reason: 'NORMAL_HANGUP' }),
        });
      } catch {}
    }

    try {
      localStorage.removeItem('voiceshield_active_call_meta');
      this.clearActiveDialogues();
    } catch {}

    this.broadcast({
      type: 'CALL_ENDED',
      timestamp: Date.now(),
      payload: { sessionId: targetSessionId },
    });
  }

  public getActiveSessionId(): string | null {
    if (this.activeSessionId) return this.activeSessionId;
    try {
      const meta = localStorage.getItem('voiceshield_active_call_meta');
      if (meta) {
        const parsed = JSON.parse(meta);
        return parsed.session_id || parsed.id || null;
      }
    } catch {}
    return null;
  }
}

export const callBridge = new CallBridgeService();
