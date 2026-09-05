# Module: Security Policy Engine

**File**: [`backend/platform/services/policy_engine.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/policy_engine.py)  
**Package**: `backend.platform.services`

---

## 1. Module Purpose & Responsibilities

`PolicyEngine` applies organizational security policies, VIP executive protection rules, and social engineering context analysis on top of Member 1's `RiskDecision`.

### Core Responsibilities
- Synthesizes raw AI risk decisions with organization-specific policies.
- Enforces instant critical escalation for enrolled executive identities (e.g., CFO `LA_0069`).
- Detects high-risk conversational intents (`OTP_REQUEST`, `PAYMENT_TRANSFER`, `CREDENTIAL_REQUEST`, `URGENT_REQUEST`) and escalates severity accordingly.
- Calculates dispatch flags (`should_warn_user`, `should_alert_org`, `should_create_incident`, `is_blocked`).

---

## 2. Data Structures

### `PolicyEvaluationResult` (Dataclass)
- `risk_score: float`: Combined risk score (0.0 - 100.0).
- `risk_level: str`: Categorical risk (`SAFE`, `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- `recommended_action: str`: E.g., `ALLOW`, `WARN_USER`, `REQUIRE_ADDITIONAL_VERIFICATION`, `BLOCK_OR_ESCALATE`.
- `scenario: str`: Diagnostic scenario name.
- `reasons: List[str]`: Human-readable explanatory factors.
- `should_warn_user: bool`: Whether to alert the caller client.
- `should_alert_org: bool`: Whether to alert the organization SOC.
- `should_create_incident: bool`: Whether to register a security incident.
- `is_blocked: bool`: Whether automated blocking is triggered.
- `warning_message: Optional[str]`: User-facing alert banner text.

---

## 3. Class: `PolicyEngine`

### Constants
```python
SENSITIVE_INTENTS = {
    "OTP_REQUEST",
    "PAYMENT_TRANSFER",
    "CREDENTIAL_REQUEST",
    "URGENT_REQUEST",
}
```

### Method: `evaluate(...) -> PolicyEvaluationResult`
```python
def evaluate(
    self,
    telemetry: ProcessedChunkTelemetry,
    protected_identity: Optional[ProtectedIdentity] = None,
    policy: Optional[SecurityPolicy] = None,
) -> PolicyEvaluationResult
```

#### Evaluation Algorithm
1. **Member 1 Fast Alert Check**: If `telemetry.is_alert == True`, set `risk_score = max(risk_score, 90.0)`, `risk_level = "CRITICAL"`.
2. **Protected Identity Rules**:
   - If `protected_identity` is present and `telemetry.verdict == "cloned"`:
     - Sets `risk_score = max(risk_score, 95.0)`
     - Sets `risk_level = "CRITICAL"`
     - Sets `scenario = "AI_CLONE_ENROLLED_SPEAKER"`
     - Prepends reason: `"CRITICAL: High-confidence voice clone impersonating protected {vip_title} ({vip_name})!"`
   - If `telemetry.verdict == "imposter"`:
     - Sets `risk_score = max(risk_score, 80.0)`, `risk_level = "HIGH"`.
3. **Sensitive Intent Escalation**:
   - If `telemetry.intent in SENSITIVE_INTENTS`:
     - For suspicious calls (`cloned`/`imposter` or `HIGH`/`CRITICAL`): increases score by +15 (capped at 100) and marks `CRITICAL`.
     - For `MEDIUM` risk calls: increases score by +10 and marks `HIGH`.
4. **Operational Flag Determination**:
   - If `risk_level in ("HIGH", "CRITICAL")`:
     - Sets `should_warn_user = True`, `should_alert_org = True`, `should_create_incident = True`.
     - Populates urgent `warning_message`.
     - Checks `auto_block_on_critical_clone` policy flag.

---

## 4. Test Traceability

- Automated Tests: [`backend/platform/tests/test_policy_engine.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_policy_engine.py)
- Live Server Validation: Checks 7 and 9 of 11-point live validation.

---

## 5. Source Files Covered

- [`backend/platform/services/policy_engine.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/policy_engine.py)
