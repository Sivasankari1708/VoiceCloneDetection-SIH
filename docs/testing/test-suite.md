# Testing: Test Suite Inventory & Execution

This document details the configuration, fixtures, execution commands, and coverage breakdown of the Member 2 test suite located in `backend/platform/tests/`.

---

## 1. Running the Automated Test Suite

### Command Line Execution
To run all 20 Member 2 platform tests using the active virtual environment:
```bash
pytest backend/platform/tests/ -v
```

### Expected Output Summary
```text
backend/platform/tests/test_api.py::test_health_endpoint PASSED
backend/platform/tests/test_api.py::test_auth_login_and_me PASSED
backend/platform/tests/test_api.py::test_protected_identities_endpoints PASSED
backend/platform/tests/test_api.py::test_calls_lifecycle_api PASSED
backend/platform/tests/test_api.py::test_policies_and_stats_endpoints PASSED
backend/platform/tests/test_auth.py::test_password_hashing PASSED
backend/platform/tests/test_auth.py::test_jwt_token_creation_and_decoding PASSED
backend/platform/tests/test_auth.py::test_role_based_access_control PASSED
backend/platform/tests/test_db.py::test_organization_and_user_creation PASSED
backend/platform/tests/test_db.py::test_call_session_and_risk_event PASSED
backend/platform/tests/test_db.py::test_database_speaker_repository_contract PASSED
backend/platform/tests/test_e2e_scenarios.py::test_scenario_1_genuine_enrolled_speaker PASSED
backend/platform/tests/test_e2e_scenarios.py::test_scenario_2_ai_cloned_cfo_attack_and_operator_mitigation PASSED
backend/platform/tests/test_e2e_scenarios.py::test_scenario_3_imposter_speaker PASSED
backend/platform/tests/test_orchestrator.py::test_start_and_end_call_lifecycle PASSED
backend/platform/tests/test_orchestrator.py::test_policy_engine_cfo_impersonation_escalation PASSED
backend/platform/tests/test_orchestrator.py::test_incident_creation_and_deduplication PASSED
backend/platform/tests/test_orchestrator.py::test_operator_action_execution PASSED
backend/platform/tests/test_websocket.py::test_websocket_stream_chunk_and_risk_update PASSED
backend/platform/tests/test_websocket.py::test_websocket_dual_alert_on_critical_voice_clone PASSED

============================== 20 passed in 1.42s ==============================
```

---

## 2. Shared Fixtures Architecture

Across the test files, the following Pytest fixtures provide fast, clean test isolation:

1. `test_db` / `auth_db` / `orch_db`:
   - Configures an in-memory SQLite database (`sqlite:///:memory:`).
   - Generates schema using `Base.metadata.create_all(engine)`.
   - Seeds an isolated `Organization` (`TEST_ORG`), three test users (`admin`, `operator`, `user`), and a sample `ProtectedIdentity` (`LA_0069`).
   - Cleans up and closes sessions after each test function completes.

2. `client`:
   - Uses FastAPI's `TestClient(app)` from `starlette.testclient`.
   - Overrides `get_db` dependency to inject the isolated testing database session.

3. `tokens`:
   - Pre-computes valid signed JWT tokens for each role (`tokens["admin"]`, `tokens["operator"]`, `tokens["user"]`).

4. `ws_client`:
   - TestClient configured for synchronous and asynchronous WebSocket interactions.

---

## 3. Test Coverage Matrix

| Component | Test File | Tests | Coverage Scope | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication & RBAC** | `test_auth.py` | 3 | Hashing, token claims, role barriers | Verified |
| **Database & Biometrics** | `test_db.py` | 3 | ORM cascade, vector serialization, repository | Verified |
| **Security Orchestrator** | `test_orchestrator.py` | 4 | Lifecycles, deduplication, policy escalation, actions | Verified |
| **REST Endpoints** | `test_api.py` | 5 | All 10 route modules and status codes | Verified |
| **WebSocket Streaming** | `test_websocket.py` | 2 | Chunk ingestion, risk updates, dual alerts | Verified |
| **End-to-End Scenarios** | `test_e2e_scenarios.py` | 3 | Canonical SIH voice cloning attack scenarios | Verified |
