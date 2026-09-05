# Integration: Member 4 (SOC Dashboard) Contract

This document provides the complete API, WebSocket, and data contracts needed by Member 4 to implement the Security Operations Center (SOC) incident investigation dashboard.

---

## 1. Overview of Member 4 Role

Member 4 builds the organization's Security Operations Center (SOC) dashboard. This console provides:
- Live alert notifications pushed via WebSocket.
- The active security incident triage queue.
- Detailed acoustic and biometric evidence breakdown.
- One-click operator mitigation controls (`BLOCK_CALL`, `CONFIRM_ATTACK`, `FALSE_POSITIVE`, `RESOLVE`).
- Protected VIP directory management and voice enrollment.
- Organization security policy tuning.
- Forensic audit log viewer.

---

## 2. API & WebSocket Specifications for Member 4

### Step 1: Security Operator Authentication
- **Endpoint**: `POST /api/auth/login`
- **Credentials**:
  ```json
  {
    "username": "operator",
    "password": "operator123"
  }
  ```
- **Response**: Yields `access_token` with `role="SECURITY_OPERATOR"` and `org_id="org_demo_001"`.

---

### Step 2: Connect Real-Time SOC Alert WebSocket
- **URL**: `ws://<host>:8000/ws/org/{org_id}/alerts?token=<access_token>`
- **Behavior**: Connection stays open indefinitely; server broadcasts whenever a high-risk voice clone is flagged.
- **Payload Received**:
  ```json
  {
    "event": "ORGANIZATION_SECURITY_ALERT",
    "data": {
      "incident_id": "inc-8b42f638-3482-4aa4-82a1-e408ec25fbe3",
      "org_id": "org_demo_001",
      "session_id": "call-18392193-4921-4f12-b539-712839102938",
      "severity": "CRITICAL",
      "scenario": "AI_CLONE_ENROLLED_SPEAKER",
      "risk_score": 98.0,
      "claimed_identity": "David Vance (Chief Financial Officer)",
      "synthetic_probability": 0.9995,
      "speaker_similarity": 0.8995,
      "intent": "OTP_REQUEST",
      "reasons": [
        "CRITICAL: High-confidence voice clone impersonating protected Chief Financial Officer (David Vance)!",
        "High acoustic synthesis probability: 0.9995",
        "Biometric speaker match against enrolled profile: 0.8995"
      ],
      "recommended_action": "BLOCK_OR_ESCALATE",
      "timestamp": "2026-09-05T07:30:15.654321Z"
    }
  }
  ```

---

### Step 3: Fetch Incident Triage Queue
- **Endpoint**: `GET /api/incidents?status=OPEN&severity=CRITICAL`
- **Headers**: `Authorization: Bearer <access_token>`
- **Response**: Array of `IncidentDto` objects sorted by `created_at` descending.

---

### Step 4: Inspect Incident Evidence & History
- **Endpoint**: `GET /api/incidents/{incident_id}`
- Returns forensic snapshot (`synthetic_probability`, `speaker_similarity`, `intent`, `reasons`, `context_signals`) and audit trail of previous actions taken on this incident.

---

### Step 5: Execute Operator Mitigation
- **Endpoint**: `POST /api/incidents/{incident_id}/action`
- **Request Body**:
  ```json
  {
    "action_type": "BLOCK_CALL",
    "notes": "Voice verified as AI clone targeting finance employee."
  }
  ```
- **Response (`200 OK`)**: Returns `SecurityActionDto`. The active call session status becomes `BLOCKED` and the caller's WebSocket is closed automatically.

---

### Step 6: View Forensic Audit Trail
- **Endpoint**: `GET /api/audit-logs?session_id={session_id}`
- Returns full chronological event history (`CALL_STARTED`, `INCIDENT_CREATED`, `SECURITY_ACTION_TAKEN`, `CALL_ENDED`).
