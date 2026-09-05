# Operations: Architecture Boundaries, Limitations & Verification Status

This document explicitly delineates what has been implemented, tested, live-validated, simulated, and what remains outside the current scope of the prototype.

---

## 1. Categorical Implementation Matrix

| Feature / Subsystem | Status | Clarification & Evidence |
| :--- | :---: | :--- |
| **FastAPI Platform Server & Router Composition** | **LIVE-VALIDATED** | Running on `http://localhost:8000`; handles all REST and WebSocket routes. |
| **PBKDF2 Password Hashing & JWT Authentication** | **LIVE-VALIDATED** | Tokens signed and verified; tested across roles (`USER`, `SECURITY_OPERATOR`, `ADMIN`). |
| **Multi-Tenant Data Isolation** | **LIVE-VALIDATED** | Enforced at SQL layer via `org_id` foreign keys and dependency checks. |
| **Member 1 AI Integration Adapter** | **LIVE-VALIDATED** | Adapts frozen pipelines; in-memory 16 kHz audio normalization confirmed. |
| **Real-Time WebSocket Audio Streaming** | **LIVE-VALIDATED** | Binary frames accepted and processed over `/ws/stream/{session_id}`. |
| **Dual Simultaneous Alert Dispatching** | **LIVE-VALIDATED** | Dispatches to caller and SOC operator WebSockets simultaneously. |
| **Session-Aware Incident Deduplication** | **LIVE-VALIDATED** | Exactly 1 incident created per attack call session; updates telemetry count. |
| **Security Policy Escalation (VIP CFO Rules)** | **LIVE-VALIDATED** | Escalates `LA_0069` to `CRITICAL` risk with instant warning banners. |
| **Immutable Compliance Audit Trail** | **LIVE-VALIDATED** | Verified canonical 4-event sequence in `audit_logs`. |
| **Application-Level Call Blocking (`BLOCK_CALL`)** | **SIMULATED** | Forcefully severs WebSocket and sets DB state to `BLOCKED`. |
| **PostgreSQL Database Storage** | **IMPLEMENTED / READY** | Engine supports PostgreSQL; development and live validation executed on SQLite. |
| **Telephony / PSTN / SIP Trunk Integration** | **NOT IMPLEMENTED** | Audio delivered via WebSockets, not physical cellular or landline networks. |
| **Physical VoIP Hardware Disconnect** | **NOT IMPLEMENTED** | Carrier-grade SS7 / SIP signaling (e.g. `BYE` packets to Asterisk/Twilio) is simulated. |
| **Out-of-Band MFA / Voice Callback Verification** | **SIMULATED** | The `REQUIRE_ADDITIONAL_VERIFICATION` action records an intent in the database. |
| **External SMS / Email Alert Dispatch** | **FUTURE EXTENSION** | Notifications are delivered via WebSockets to SOC dashboards; no external Twilio/SendGrid SMS. |
| **Multilingual Voice Clone Detection** | **LIMITED** | Whisper model is configured for English (`base.en`); non-English cloning untested. |
| **Edge Device / On-Device Mobile Inference** | **FUTURE EXTENSION** | Inferences run centrally on backend server CPU/GPU. |

---

## 2. Technical Boundaries & Implementation Clarifications

### 2.1 Telecom Call Termination vs. Simulated `BLOCK_CALL`
- **Prototype Limitation**: In a commercial telecommunications environment, blocking a fraudulent phone call requires issuing SIP `BYE` messages or SS7 call teardown signaling to a telecom carrier gateway (e.g., Twilio, FreeSWITCH, or Cisco CUCM).
- **Current Implementation**: The prototype executes **application-level call blocking**. When an operator executes `BLOCK_CALL`, the backend:
  1. Updates the `call_sessions` database record to `status = "BLOCKED"`.
  2. Dispatches a `SECURITY_ACTION_DISPATCHED` event to the caller's active WebSocket connection.
  3. Forcefully terminates and closes the WebSocket connection.
- **Classification**: **SIMULATED (Application-Level)**.

### 2.2 Database Support (PostgreSQL vs. SQLite)
- **Implementation**: The database layer uses standard SQLAlchemy ORM models with standard ANSI SQL datatypes and JSON-serialized text columns. The configuration supports PostgreSQL via `DATABASE_URL=postgresql://...`.
- **Validation Reality**: Automated testing and local live validation were conducted using the default SQLite configuration (`sqlite:///./voice_clone_detection.db`). PostgreSQL connectivity is architecturally supported but has not been validated against a remote PostgreSQL cluster in this test pass.
- **Classification**: **IMPLEMENTED / TESTED ON SQLITE**.

### 2.3 Audio Ingestion & Browser Microphone
- **Implementation**: The backend accepts 16 kHz 16-bit PCM binary frames or Base64 WAV data over WebSockets.
- **Validation Reality**: Live server validation was executed using an automated WebSocket client streaming real acoustic audio frames from disk. While the endpoint matches browser `MediaStreamTrackProcessor` outputs, physical microphone recording in an actual web browser was simulated via automated clients.
- **Classification**: **LIVE-VALIDATED VIA WEBSOCKET CLIENT**.

### 2.4 Multi-Language & Dialect Coverage
- DeepfakeCNN v2 was trained and evaluated on the ASVspoof 2019 Logical Access dataset (predominantly English).
- Faster-Whisper is initialized with `Systran/faster-whisper-base.en`.
- Detection accuracy on regional Indian languages (Hindi, Tamil, Telugu, etc.) has not been established and represents a future extension.
