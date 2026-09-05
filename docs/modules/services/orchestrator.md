# Module: Security Orchestrator Service

**File**: [`backend/platform/services/orchestrator.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/orchestrator.py)  
**Package**: `backend.platform.services`

---

## 1. Module Purpose & Responsibilities

`SecurityOrchestrator` is the central orchestration brain of the Member 2 platform. It connects audio stream ingestion to Member 1 AI models, evaluates organization security policies, persists risk timeline events, manages session-aware incident deduplication, triggers dual real-time alert broadcasts (caller + SOC), executes operator response actions, and generates immutable audit trails.

---

## 2. Dependencies & Imports

- **Internal Services**:
  - `AIAdapter`, `ProcessedChunkTelemetry` from [`backend.platform.services.ai_adapter`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/ai_adapter.py)
  - `AlertDispatcher` from [`backend.platform.services.alert_dispatcher`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/alert_dispatcher.py)
  - `PolicyEngine`, `PolicyEvaluationResult` from [`backend.platform.services.policy_engine`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/policy_engine.py)
- **Database Models**:
  - `AuditLog`, `CallSession`, `ProtectedIdentity`, `RiskEvent`, `SecurityAction`, `SecurityIncident`, `SecurityPolicy`, `User`, `utcnow`
- **SQLAlchemy**: `Session`

---

## 3. Class: `SecurityOrchestrator`

### Constructor
```python
def __init__(self, db: Session) -> None
```
- **Parameters**: `db: Session` (Request-scoped or worker-scoped SQLAlchemy session)
- **Initialized Subcomponents**:
  - `self.db = db`
  - `self.ai_adapter = AIAdapter.get_instance()`
  - `self.alert_dispatcher = AlertDispatcher.get_instance()`
  - `self.policy_engine = PolicyEngine()`

---

### Methods

#### 3.1 `create_call_session(...) -> CallSession`
```python
def create_call_session(
    self,
    user: User,
    caller_claimed_id: Optional[str] = None,
    caller_phone_number: Optional[str] = None,
    callee_phone_number: Optional[str] = None,
    channel: str = "WEBSOCKET",
    session_id: Optional[str] = None,
) -> CallSession
```
- **Purpose**: Initializes a new monitored call session in database.
- **Workflow**:
  1. Resolves whether `caller_claimed_id` matches a `ProtectedIdentity` in `user.org_id`.
  2. Creates and persists `CallSession` record (`status="ACTIVE"`).
  3. Records audit log `CALL_STARTED`.
  4. Returns hydrated `CallSession`.

#### 3.2 `process_audio_chunk(...) -> Tuple[Optional[ProcessedChunkTelemetry], Optional[PolicyEvaluationResult]]`
```python
async def process_audio_chunk(
    self,
    session_id: str,
    raw_audio_bytes: bytes,
) -> Tuple[Optional[ProcessedChunkTelemetry], Optional[PolicyEvaluationResult]]
```
- **Purpose**: Ingests binary audio from caller WebSocket, runs AI inference, evaluates policy, persists telemetry, and dispatches alerts.
- **Workflow Steps**:
  1. Looks up `CallSession` and `ProtectedIdentity`.
  2. Bypasses processing if session status is not `"ACTIVE"`.
  3. Invokes `AIAdapter.process_chunk(session_id, raw_audio_bytes, claimed_speaker_id)`.
  4. Evaluates `PolicyEngine.evaluate(telemetry, protected_identity, policy)`.
  5. Inserts `RiskEvent` into database.
  6. Updates `CallSession` aggregate metrics (`peak_risk_score`, `final_verdict`).
  7. If `policy_result.should_create_incident`: calls `self._handle_incident_and_alerts(...)`.
  8. Returns `(telemetry, policy_result)`.

#### 3.3 `_handle_incident_and_alerts(...) -> None` (Private)
```python
async def _handle_incident_and_alerts(
    self,
    call: CallSession,
    telemetry: ProcessedChunkTelemetry,
    policy_res: PolicyEvaluationResult,
    identity: Optional[ProtectedIdentity],
) -> None
```
- **Purpose**: Implements session-aware incident deduplication and triggers dual alert dispatches.
- **Deduplication Logic**:
  - Queries `SecurityIncident` where `session_id == call.session_id`.
  - If incident already exists: increments `incident.attack_chunks_detected += 1`, updates `evidence_json`, and commits.
  - If incident does not exist: creates a new `SecurityIncident` (`status="OPEN"`, `severity=policy_res.risk_level`), logs `INCIDENT_CREATED` audit event, and broadcasts `ORGANIZATION_SECURITY_ALERT` to SOC WebSockets.
- **Dual Alert Dispatching**:
  - Dispatches `USER_SECURITY_ALERT` to the caller stream WebSocket.
  - Dispatches `ORGANIZATION_SECURITY_ALERT` to connected SOC operator WebSockets.

#### 3.4 `execute_operator_action(...) -> Dict[str, Any]`
```python
async def execute_operator_action(
    self,
    incident_id: str,
    action_type: str,
    actor: User,
    notes: Optional[str] = None,
) -> Dict[str, Any]
```
- **Purpose**: Applies an operator mitigation action to an active incident.
- **Workflow Steps**:
  1. Verifies tenant ownership (`incident.org_id == actor.org_id`).
  2. Inserts `SecurityAction` model.
  3. Updates incident status based on `action_type`.
  4. If `action_type == "BLOCK_CALL"`:
     - Updates `CallSession.status = "BLOCKED"`.
     - Dispatches `SECURITY_ACTION_DISPATCHED` event to the active call session WebSocket.
  5. Inserts `SECURITY_ACTION_TAKEN` audit event.
  6. Commits database transaction and returns action dictionary.

#### 3.5 `finish_call_session(...) -> CallSession`
```python
def finish_call_session(
    self,
    session_id: str,
    final_verdict: Optional[str] = None,
) -> CallSession
```
- **Purpose**: Marks call as ended, calculates session duration, and records `CALL_ENDED` audit event.

---

## 4. Source Files Covered

- [`backend/platform/services/orchestrator.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/orchestrator.py)
