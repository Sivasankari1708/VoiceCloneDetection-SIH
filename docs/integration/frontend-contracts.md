# Integration: Frontend Unified Event Contracts

This document summarizes the unified TypeScript interfaces, message envelopes, and WebSocket event types for frontend engineers connecting to the Member 2 Backend Platform.

---

## 1. WebSocket Protocol & Envelopes

All WebSocket events conform to the following standard JSON envelope:

```typescript
export interface BaseWebSocketMessage<T = any> {
  event: WebSocketEventType;
  timestamp: string; // ISO 8601 UTC
  data: T;
}

export type WebSocketEventType =
  | "CALL_STARTED"
  | "RISK_UPDATE"
  | "USER_SECURITY_ALERT"
  | "ORGANIZATION_SECURITY_ALERT"
  | "INCIDENT_CREATED"
  | "INCIDENT_UPDATED"
  | "SECURITY_ACTION_DISPATCHED"
  | "CALL_ENDED"
  | "ERROR";
```

---

## 2. Event Payload Contracts

### 2.1 `RISK_UPDATE` (Caller Stream Channel)
```typescript
export interface RiskUpdatePayload {
  session_id: string;
  chunk_id: number;
  timestamp: string;
  speech_detected: boolean;
  risk_score: number; // 0.0 to 100.0
  risk_level: "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  synthetic_probability?: number; // 0.0 to 1.0
  smoothed_synthetic_probability?: number;
  speaker_similarity?: number; // -1.0 to 1.0
  smoothed_speaker_similarity?: number;
  identity_status: "MATCHED" | "MISMATCHED" | "UNENROLLED" | "INCONCLUSIVE";
  speaker_match?: boolean;
  transcript: string;
  accumulated_transcript: string;
  intent: string;
  intent_confidence: number;
  context_signals: string[];
  verdict: "genuine" | "cloned" | "imposter" | "inconclusive";
  reasons: string[];
  recommended_action: "ALLOW" | "MONITOR" | "VERIFY_SPEAKER" | "BLOCK_OR_ESCALATE";
  is_alert: boolean;
  alert_reason?: string;
  latency_ms: number;
  real_time_factor: number;
}
```

### 2.2 `USER_SECURITY_ALERT` (Caller Stream Channel)
```typescript
export interface UserSecurityAlertPayload {
  session_id: string;
  severity: "HIGH" | "CRITICAL";
  risk_score: number;
  warning_message: string;
  claimed_identity?: string;
  reasons: string[];
  recommended_action: string;
  timestamp: string;
}
```

### 2.3 `ORGANIZATION_SECURITY_ALERT` (SOC Channel)
```typescript
export interface OrganizationSecurityAlertPayload {
  incident_id: string;
  org_id: string;
  session_id: string;
  severity: "HIGH" | "CRITICAL";
  scenario: string;
  risk_score: number;
  claimed_identity?: string;
  synthetic_probability?: number;
  speaker_similarity?: number;
  intent?: string;
  reasons: string[];
  recommended_action: string;
  timestamp: string;
}
```

---

## 3. Authentication Headers

All REST requests requiring authentication must include:
```http
Authorization: Bearer <access_token>
```
For WebSockets where custom headers cannot be set in browser standard APIs:
- Pass token as query parameter: `/ws/org/{org_id}/alerts?token=<access_token>`.
