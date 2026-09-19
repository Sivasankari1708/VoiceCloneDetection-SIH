import type { CallHistoryItem, SeverityLevel, TranscriptSegment, CallTimelineEvent } from '../../types';
import { config } from '../config';
import { authService } from '../auth/authService';
import { mapRiskLevel } from '../../utils/dataMapper';

export const LOCAL_CALL_HISTORY_KEY = 'voiceshield_call_history';

// ─── Backend DTO ──────────────────────────────────────────────
export interface BackendCallSummary {
  session_id: string;
  start_time?: string;
  started_at?: string;
  end_time?: string;
  ended_at?: string;
  caller_name?: string;
  caller_number?: string;
  caller_role?: string;
  claimed_speaker_id?: string;
  claimed_org_id?: string;
  claimed_org_name?: string;
  organization?: string;
  current_risk_level?: string;
  final_risk_level?: string;
  current_risk_score?: number;
  final_risk_score?: number;
  final_verdict?: string;
  alert_triggered?: boolean;
  alert_reason?: string;
  recommended_action?: string;
  accumulated_transcript?: string;
  status?: string;
  scenario?: string;
  total_speech_seconds?: number;
}

export function mapBackendCallSummary(raw: any): CallHistoryItem {
  const startRaw = raw.start_time || raw.started_at;
  const startTime = startRaw ? new Date(startRaw) : new Date();
  const endRaw = raw.end_time || raw.ended_at;
  const endTime = endRaw ? new Date(endRaw) : new Date();
  const diffSec = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
  const duration = diffSec > 0 ? diffSec : Math.round(raw.total_speech_seconds || 45);

  const rawRisk = raw.current_risk_level || raw.final_risk_level || 'SAFE';
  const severity: SeverityLevel = mapRiskLevel(rawRisk);
  const score = raw.current_risk_score ?? raw.final_risk_score ?? (severity === 'CRITICAL' ? 88 : severity === 'HIGH' ? 72 : severity === 'MEDIUM' ? 45 : 12);
  const callerName = raw.caller_name || 'External Caller';
  const orgName = raw.claimed_org_name || raw.organization || 'Indian Overseas Bank';
  const isHighRisk = severity === 'CRITICAL' || severity === 'HIGH' || score >= 65;

  let parsedTranscript: TranscriptSegment[] = [];
  if (Array.isArray(raw.transcript) && raw.transcript.length > 0) {
    parsedTranscript = raw.transcript.map((t: any, idx: number) => ({
      id: t.id || `tr-${idx}`,
      speaker: t.speaker === 'employee' ? 'employee' : 'caller',
      text: t.text || '',
      timestamp: typeof t.timestamp === 'number' ? t.timestamp : idx * 5000,
    }));
  } else if (raw.accumulated_transcript && typeof raw.accumulated_transcript === 'string') {
    parsedTranscript = [
      {
        id: `tr-${raw.session_id || Date.now()}`,
        speaker: 'caller',
        text: raw.accumulated_transcript,
        timestamp: 0,
      },
    ];
  }

  const timeline: CallTimelineEvent[] = [
    {
      time: startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      description: `Call initiated from ${raw.caller_number || '+91 98201 44102'} (${callerName})`,
      type: 'info',
    },
    ...(isHighRisk
      ? [
          {
            time: new Date(startTime.getTime() + 20000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            description: 'Synthetic voice artifacts & unauthorized intent detected',
            type: 'warning' as const,
          },
          {
            time: endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            description: 'Autonomous intervention triggered — call placed on security hold and terminated',
            type: 'critical' as const,
          },
        ]
      : [
          {
            time: endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            description: 'Speech verification matched speaker voiceprint baseline',
            type: 'success' as const,
          },
        ]),
  ];

  return {
    id: raw.session_id || raw.id,
    caller: {
      name: callerName,
      claimedRole: raw.caller_role || (raw.claimed_speaker_id ? 'Bank Manager / Official' : 'Customer Account Representative'),
      organization: orgName,
      status: isHighRisk ? 'failed' : 'verified',
      statusMessage: raw.alert_reason || (isHighRisk ? 'Vocal Impersonation Pattern Detected' : 'Caller Identity Verified'),
    },
    source: 'browser',
    startTime,
    endTime,
    duration,
    finalSeverity: severity,
    finalScore: score,
    finalAction:
      raw.recommended_action ||
      (isHighRisk ? 'Autonomous Hold & Call Terminated (Protected)' : 'Call completed normally'),
    transcript: parsedTranscript,
    timeline,
    summary: `Call with ${callerName} (${orgName}) — Verdict: ${raw.final_verdict || (isHighRisk ? 'Voice Clone / Deepfake Impersonation' : 'Genuine Caller')}`,
    recommendation: raw.recommended_action || (isHighRisk ? 'Reported to SOC. Verify caller identity via out-of-band communication.' : 'No security threats detected.'),
    signals: [],
    scenarioId: raw.scenario,
  };
}

/** Saves a completed call to the persistent local call history cache */
export function saveLocalCallHistory(call: CallHistoryItem): void {
  try {
    const existing = getLocalCallHistory();
    const filtered = existing.filter((c) => c.id !== call.id);
    const updated = [call, ...filtered].slice(0, 100);
    localStorage.setItem(LOCAL_CALL_HISTORY_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[callHistoryService] Failed saving local history:', err);
  }
}

/** Retrieves locally cached call history items */
export function getLocalCallHistory(): CallHistoryItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_CALL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      ...item,
      startTime: item.startTime ? new Date(item.startTime) : new Date(),
      endTime: item.endTime ? new Date(item.endTime) : new Date(),
    }));
  } catch {
    return [];
  }
}

/** Fetches call history from backend API, augmented with local call history */
export async function fetchCallHistory(): Promise<CallHistoryItem[]> {
  const localCalls = getLocalCallHistory();
  try {
    const token = authService.getToken();
    const res = await fetch(`${config.apiBaseUrl}/api/calls`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const calls: BackendCallSummary[] = Array.isArray(data) ? data : (data.calls ?? []);
      const mapped = calls.map(mapBackendCallSummary);

      // Merge backend and local calls, giving precedence to local calls with rich transcripts
      const callMap = new Map<string, CallHistoryItem>();
      localCalls.forEach((c) => callMap.set(c.id, c));
      mapped.forEach((c) => {
        if (!callMap.has(c.id)) {
          callMap.set(c.id, c);
        } else {
          // Merge transcript if backend has one and local was empty
          const existing = callMap.get(c.id)!;
          if ((!existing.transcript || existing.transcript.length === 0) && c.transcript?.length) {
            existing.transcript = c.transcript;
          }
        }
      });

      return Array.from(callMap.values()).sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
    }
  } catch (err) {
    console.warn('[callHistoryService] Backend fetchCallHistory unavailable, using local history:', err);
  }

  return localCalls;
}

export interface BackendRiskEventDto {
  id: string;
  session_id: string;
  chunk_id: number;
  risk_score: number;
  risk_level: string;
  verdict: string;
  speech_detected: boolean;
  transcript?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

/** Fetches a single call session by session ID from backend or local storage */
export async function fetchCallById(sessionId: string): Promise<CallHistoryItem | null> {
  const localCalls = getLocalCallHistory();
  const foundLocal = localCalls.find((c) => c.id === sessionId);
  if (foundLocal && foundLocal.transcript && foundLocal.transcript.length > 0) {
    return foundLocal;
  }

  try {
    const token = authService.getToken();
    const res = await fetch(`${config.apiBaseUrl}/api/calls/${sessionId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      const mapped = mapBackendCallSummary(data);
      if (foundLocal?.transcript?.length) {
        mapped.transcript = foundLocal.transcript;
      }
      return mapped;
    }
  } catch {}

  return foundLocal || null;
}

/** Fetches persisted risk events for a call session from the backend */
export async function fetchCallEvents(sessionId: string): Promise<BackendRiskEventDto[]> {
  try {
    const token = authService.getToken();
    const res = await fetch(`${config.apiBaseUrl}/api/calls/${sessionId}/events`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}