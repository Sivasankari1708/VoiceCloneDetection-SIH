import type { CallHistoryItem, SeverityLevel } from '../../types';
import { config } from '../config';
import { authService } from '../auth/authService';
import { mapRiskLevel } from '../../utils/dataMapper';

// ─── Backend DTO ──────────────────────────────────────────────
interface BackendCallSummary {
  session_id: string;
  started_at: string;
  ended_at?: string;
  caller_name?: string;
  caller_role?: string;
  organization?: string;
  final_risk_level?: string;
  final_risk_score?: number;
  final_verdict?: string;
  recommended_action?: string;
  scenario?: string;
}

function mapBackendCallSummary(raw: BackendCallSummary): CallHistoryItem {
  const startTime = new Date(raw.started_at);
  const endTime = raw.ended_at ? new Date(raw.ended_at) : new Date();
  const duration = Math.max(0, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));
  const severity: SeverityLevel = raw.final_risk_level
    ? mapRiskLevel(raw.final_risk_level)
    : 'SAFE';

  return {
    id: raw.session_id,
    caller: {
      name: raw.caller_name || 'Unknown Caller',
      claimedRole: raw.caller_role || '',
      organization: raw.organization || '',
      status: 'checking',
      statusMessage: '',
    },
    source: 'browser',
    startTime,
    endTime,
    duration,
    finalSeverity: severity,
    finalScore: raw.final_risk_score ?? 0,
    finalAction: raw.recommended_action || (severity === 'SAFE' ? 'Call completed normally' : 'Review required'),
    transcript: [],
    timeline: [],
    summary: `Call with ${raw.caller_name || 'unknown caller'} — verdict: ${raw.final_verdict || 'inconclusive'}`,
    recommendation: raw.recommended_action || '',
    signals: [],
    scenarioId: raw.scenario,
  };
}

/** Fetches call history from the real backend. Falls back to empty array on error. */
export async function fetchCallHistory(): Promise<CallHistoryItem[]> {
  try {
    const token = authService.getToken();
    const res = await fetch(`${config.apiBaseUrl}/api/calls`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return [];
    const data = await res.json();
    const calls: BackendCallSummary[] = Array.isArray(data) ? data : (data.calls ?? []);
    return calls.map(mapBackendCallSummary);
  } catch {
    return [];
  }
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

/** Fetches a single call session by session ID from the backend */
export async function fetchCallById(sessionId: string): Promise<CallHistoryItem | null> {
  try {
    const token = authService.getToken();
    const res = await fetch(`${config.apiBaseUrl}/api/calls/${sessionId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const data = await res.json();
    return mapBackendCallSummary(data);
  } catch {
    return null;
  }
}

/** Fetches persisted risk events for a call session from the backend */
export async function fetchCallEvents(sessionId: string): Promise<BackendRiskEventDto[]> {
  try {
    const token = authService.getToken();
    const res = await fetch(`${config.apiBaseUrl}/api/calls/${sessionId}/events`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}