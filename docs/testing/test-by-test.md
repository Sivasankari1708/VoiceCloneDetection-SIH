# Testing: Test-by-Test Technical Specification

This document provides a comprehensive technical audit of all 20 automated tests implemented in `backend/platform/tests/`.

---

## 1. Authentication & Security Tests (`test_auth.py`)

### 1.1 `test_password_hashing()`
- **File**: [`backend/platform/tests/test_auth.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_auth.py#L60-L66)
- **Purpose**: Verify PBKDF2-HMAC-SHA256 password hashing and validation.
- **Input**: Plaintext string `"SuperSecretPassword123!"`.
- **Behavior**: Calls `hash_password()`, checks format (`salt$hex_key`), verifies correct password returns `True`, and verifies bad password returns `False`.
- **Proven**: PBKDF2 salt generation and constant-time HMAC comparison are correct.
- **Not Proven**: Password complexity rules (handled at schema level).

### 1.2 `test_jwt_token_creation_and_decoding(auth_db)`
- **File**: [`backend/platform/tests/test_auth.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_auth.py#L68-L78)
- **Purpose**: Validate JWT token signing, claims encoding, and symmetric HS256 decoding.
- **Input**: Authenticated `User` model (`role="SECURITY_OPERATOR"`, `org_id="test_org_001"`).
- **Assertions**: Decoded payload contains `sub == user.id`, `username == user.username`, `role == "SECURITY_OPERATOR"`, and `org_id == "test_org_001"`. Expired or garbage tokens return `None`.
- **Proven**: Token claims accurately carry identity and tenant boundaries.
- **Not Proven**: Asymmetric key rotation (RS256).

### 1.3 `test_role_based_access_control(auth_db)`
- **File**: [`backend/platform/tests/test_auth.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_auth.py#L80-L97)
- **Purpose**: Validate RBAC role enforcement via `require_role`.
- **Input**: Three users with roles `USER`, `SECURITY_OPERATOR`, `ADMIN`.
- **Behavior**: Evaluates gate `require_role(["SECURITY_OPERATOR"])`.
- **Assertions**: `USER` raises `HTTPException(403)`. `SECURITY_OPERATOR` passes. `ADMIN` passes via universal privilege bypass.
- **Proven**: Role gate dependency strictly halts unauthorized actors and allows admins.

---

## 2. Database & Repository Tests (`test_db.py`)

### 2.1 `test_organization_and_user_creation(test_db)`
- **File**: [`backend/platform/tests/test_db.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_db.py#L40-L63)
- **Purpose**: Test multi-tenant organization creation, user relationships, and cascade deletions.
- **Assertions**: Querying `org.users` contains associated users. Deleting `Organization` cascades to child `User` records.
- **Proven**: Foreign key cascade rules and tenant modeling work as intended.

### 2.2 `test_call_session_and_risk_event(test_db)`
- **File**: [`backend/platform/tests/test_db.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_db.py#L65-L98)
- **Purpose**: Verify lifecycle and risk event attachment for call sessions.
- **Assertions**: Inserting `CallSession` and associated `RiskEvent` links properly via `session_id`. `to_dict()` outputs match schema fields.
- **Proven**: Telemetry chunks persist properly against active calls.

### 2.3 `test_database_speaker_repository_contract(test_db)`
- **File**: [`backend/platform/tests/test_db.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_db.py#L100-L140)
- **Purpose**: Verify `DatabaseSpeakerRepository` adheres to Member 1's `BaseSpeakerRepository` contract.
- **Input**: Random 192-D L2-normalized float32 NumPy vector for speaker `spk_test_101`.
- **Assertions**: `save_profile()`, `get_profile()`, `get_reference_embedding()`, `has_speaker()`, `list_speakers()`, and `delete_profile()` all execute correctly without loss of precision.
- **Proven**: Member 1 biometric persistence works seamlessly with SQL databases.

---

## 3. Orchestration & Policy Tests (`test_orchestrator.py`)

### 3.1 `test_start_and_end_call_lifecycle(orch_db)`
- **File**: [`backend/platform/tests/test_orchestrator.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_orchestrator.py#L63-L87)
- **Purpose**: Test standard call creation, audit logging, and finalization.
- **Assertions**: Session status starts `ACTIVE`, finalizes `ENDED`. Audit log records `CALL_STARTED` and `CALL_ENDED`.

### 3.2 `test_policy_engine_cfo_impersonation_escalation(orch_db)`
- **File**: [`backend/platform/tests/test_orchestrator.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_orchestrator.py#L89-L134)
- **Purpose**: Validate PolicyEngine escalation when an AI clone claims CFO identity `LA_0069`.
- **Input**: `telemetry.verdict = "cloned"`, `synthetic_probability = 0.98`, `intent = "OTP_REQUEST"`.
- **Assertions**: `risk_level == "CRITICAL"`, `risk_score >= 95.0`, `should_warn_user == True`, `should_alert_org == True`, `should_create_incident == True`.
- **Proven**: Priority VIP protection rules dynamically trigger critical alert status.

### 3.3 `test_incident_creation_and_deduplication(orch_db, monkeypatch)`
- **File**: [`backend/platform/tests/test_orchestrator.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_orchestrator.py#L136-L199)
- **Purpose**: Verify that multiple consecutive malicious chunks in the same call session do NOT create duplicate incidents.
- **Input**: Ingests 3 consecutive malicious chunks with high synthetic probabilities.
- **Assertions**: Exactly ONE `SecurityIncident` row exists in the database. `attack_chunks_detected` increments to 3.
- **Proven**: Session-aware deduplication prevents SOC alert storms.

### 3.4 `test_operator_action_execution(orch_db)`
- **File**: [`backend/platform/tests/test_orchestrator.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_orchestrator.py#L201-L245)
- **Purpose**: Test operator mitigation (`BLOCK_CALL`).
- **Assertions**: Incident status updates to `CONFIRMED_ATTACK`. Associated `CallSession` status transitions to `BLOCKED`. Audit log contains `SECURITY_ACTION_TAKEN`.

---

## 4. REST API Tests (`test_api.py`)

### 4.1 `test_health_endpoint(client)`
- **File**: [`backend/platform/tests/test_api.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_api.py#L42-L49)
- **Assertions**: Status 200, `status == "healthy"`, `database_connected == true`.

### 4.2 `test_auth_login_and_me(client, tokens)`
- **File**: [`backend/platform/tests/test_api.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_api.py#L51-L70)
- **Assertions**: Valid login returns token. `GET /api/auth/me` with Bearer header returns user profile.

### 4.3 `test_protected_identities_endpoints(client, tokens)`
- **File**: [`backend/platform/tests/test_api.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_api.py#L72-L100)
- **Assertions**: `POST /api/protected-identities` registers identity. `GET /api/protected-identities` lists the enrolled executive.

### 4.4 `test_calls_lifecycle_api(client, tokens)`
- **File**: [`backend/platform/tests/test_api.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_api.py#L102-L137)
- **Assertions**: `POST /api/calls` creates session. `GET /api/calls/{session_id}` returns state. `POST /api/calls/{session_id}/finish` ends session.

### 4.5 `test_policies_and_stats_endpoints(client, tokens)`
- **File**: [`backend/platform/tests/test_api.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_api.py#L139-L168)
- **Assertions**: `GET /api/policies` returns defaults. `PUT /api/policies` updates risk thresholds. `GET /api/stats` returns telemetry counts.

---

## 5. WebSocket Streaming Tests (`test_websocket.py`)

### 5.1 `test_websocket_stream_chunk_and_risk_update(ws_client, monkeypatch)`
- **File**: [`backend/platform/tests/test_websocket.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_websocket.py#L29-L101)
- **Purpose**: Verify binary chunk transmission and `RISK_UPDATE` JSON reception.
- **Input**: 1-second raw PCM audio bytes.
- **Assertions**: Server responds with `event == "RISK_UPDATE"` containing `risk_score`, `risk_level`, and `synthetic_probability`.

### 5.2 `test_websocket_dual_alert_on_critical_voice_clone(ws_client, monkeypatch)`
- **File**: [`backend/platform/tests/test_websocket.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_websocket.py#L103-L175)
- **Purpose**: Verify dual simultaneous alert delivery to caller and SOC operator.
- **Assertions**: Caller socket receives `USER_SECURITY_ALERT`. SOC socket receives `ORGANIZATION_SECURITY_ALERT`.

---

## 6. End-to-End SIH Scenarios (`test_e2e_scenarios.py`)

### 6.1 `test_scenario_1_genuine_enrolled_speaker(e2e_setup)`
- **File**: [`backend/platform/tests/test_e2e_scenarios.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_e2e_scenarios.py#L82-L122)
- **Assertions**: Synthetic probability low (0.02), speaker similarity high (0.88), verdict `genuine`, risk level `SAFE`, 0 incidents created.

### 6.2 `test_scenario_2_ai_cloned_cfo_attack_and_operator_mitigation(e2e_setup)`
- **File**: [`backend/platform/tests/test_e2e_scenarios.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_e2e_scenarios.py#L124-L201)
- **Assertions**: Synthetic probability high (0.98), claimed CFO identity `LA_0069`, verdict `cloned`, risk level `CRITICAL`, dual alert dispatched, 1 incident created, operator executes `BLOCK_CALL`, session status becomes `BLOCKED`.

### 6.3 `test_scenario_3_imposter_speaker(e2e_setup)`
- **File**: [`backend/platform/tests/test_e2e_scenarios.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_e2e_scenarios.py#L203-L245)
- **Assertions**: Synthetic probability low (0.05), speaker similarity low (0.32), verdict `imposter`, risk level `HIGH`, recommended action `REQUIRE_ADDITIONAL_VERIFICATION`.
