# Module: REST & WebSocket API Routes Overview

**Package**: `backend.platform.server.routes`  
**Base Route Mount**: Mounted on the root FastAPI instance in [`backend/platform/server/app.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/app.py).

---

## 1. Module Inventory

The API routing layer comprises 10 dedicated controllers:

| File | Prefix | Tags | Purpose |
| :--- | :--- | :--- | :--- |
| [`auth.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/auth.py) | `/api/auth` | Authentication | Login, token issuance, user profile |
| [`calls.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/calls.py) | `/api/calls` | Call Sessions | Call lifecycle, session creation, history, timeline |
| [`incidents.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/incidents.py) | `/api/incidents` | Security Incidents | Incident triage, investigation, operator action mitigation |
| [`protected_identities.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/protected_identities.py) | `/api/protected-identities` | Protected Identities | VIP directory, enrollment, biometric linking |
| [`policies.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/policies.py) | `/api/policies` | Security Policies | Risk thresholds, automated defense rules |
| [`audit.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/audit.py) | `/api/audit-logs` | Audit Logs | Forensic audit trail listing and filtering |
| [`health.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/health.py) | `/api` | System & Telemetry | Public health check (`/health`) and metrics (`/stats`) |
| [`analyze.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/analyze.py) | `/api/analyze` | Batch Analysis | Offline multipart/form-data audio file analysis |
| [`organizations.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/organizations.py) | `/api/organizations` | Organizations | Tenant organization metadata (`/me`) |
| [`websocket_stream.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/websocket_stream.py) | `/ws` | Real-Time Streaming | Caller audio WebSocket and SOC alert broadcast WebSocket |

---

## 2. Route Controller Details

### 2.1 Authentication (`auth.py`)
- `POST /api/auth/login`: Accepts `LoginRequest(username, password)`. Compares PBKDF2 hash, issues signed JWT access token.
- `GET /api/auth/me`: Requires authenticated user. Returns `UserProfileDto`.

### 2.2 Call Sessions (`calls.py`)
- `POST /api/calls`: Registers a monitored call. Generates `session_id`, logs `CALL_STARTED` audit event.
- `GET /api/calls`: Lists organization call sessions with status/caller filters.
- `GET /api/calls/{session_id}`: Retrieves full call session metadata and final verdict.
- `GET /api/calls/{session_id}/timeline`: Returns chronological chunk telemetry events for acoustic charting.
- `POST /api/calls/{session_id}/finish`: Concludes active session, updates final verdict, logs `CALL_ENDED`.

### 2.3 Security Incidents & Actions (`incidents.py`)
- `GET /api/incidents`: Lists security incidents filtered by severity (`HIGH`, `CRITICAL`) and status.
- `GET /api/incidents/{incident_id}`: Fetches complete incident breakdown, forensic acoustic snapshot, and mitigation history.
- `PATCH /api/incidents/{incident_id}`: Updates incident triage status and analyst notes.
- `POST /api/incidents/{incident_id}/action`: Executes security mitigations (`BLOCK_CALL`, `CONFIRM_ATTACK`, `FALSE_POSITIVE`, `ESCALATE`, `RESOLVE`).

### 2.4 Protected Executive Identities (`protected_identities.py`)
- `POST /api/protected-identities`: Registers an executive/VIP to be protected from voice clone attacks.
- `GET /api/protected-identities`: Lists all enrolled protected identities for the tenant.
- `GET /api/protected-identities/{id}`: Retrieves identity profile and biometric enrollment status.
- `POST /api/protected-identities/{id}/enroll`: Enrolls voice samples (Base64 audio or paths) through Member 1's `SpeakerEnrollmentService`.
- `DELETE /api/protected-identities/{id}`: Deactivates VIP identity.

### 2.5 Security Policies (`policies.py`)
- `GET /api/policies`: Retrieves tenant policy thresholds and automated escalation rules.
- `PUT /api/policies`: Allows `ADMIN` users to modify thresholds, VIP rules, and sensitive intent escalation.

### 2.6 Audit Logs (`audit.py`)
- `GET /api/audit-logs`: Lists immutable compliance events (`CALL_STARTED`, `INCIDENT_CREATED`, `SECURITY_ACTION_TAKEN`, `CALL_ENDED`).

### 2.7 Health & Telemetry (`health.py`)
- `GET /api/health`: Public probe verifying database connectivity and AI model readiness.
- `GET /api/stats`: Telemetry counter aggregation for active calls, detected clones, open incidents, and protected VIPs.

### 2.8 Batch File Analysis (`analyze.py`)
- `POST /api/analyze/file`: Accepts multipart audio upload, executes Member 1 batch inference and risk scoring.

### 2.9 Tenant Organization (`organizations.py`)
- `GET /api/organizations/me`: Returns tenant name, code, creation date, and status.

### 2.10 WebSockets (`websocket_stream.py`)
- `WebSocket /ws/stream/{session_id}`: Bidirectional audio streaming channel for caller. Accepts binary audio chunks (PCM, WAV, WebM), returns per-chunk risk telemetry and urgent warnings.
- `WebSocket /ws/org/{org_id}/alerts`: Broadcast feed pushing real-time SOC incident alerts to security operator consoles.

---

## 3. Source Files Covered

- [`backend/platform/server/routes/auth.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/auth.py)
- [`backend/platform/server/routes/calls.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/calls.py)
- [`backend/platform/server/routes/incidents.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/incidents.py)
- [`backend/platform/server/routes/protected_identities.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/protected_identities.py)
- [`backend/platform/server/routes/policies.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/policies.py)
- [`backend/platform/server/routes/audit.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/audit.py)
- [`backend/platform/server/routes/health.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/health.py)
- [`backend/platform/server/routes/analyze.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/analyze.py)
- [`backend/platform/server/routes/organizations.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/organizations.py)
- [`backend/platform/server/routes/websocket_stream.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/server/routes/websocket_stream.py)
