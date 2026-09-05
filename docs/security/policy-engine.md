# Security Policy Engine: Organizational Rules & VIP Protection

## 1. File Location & Purpose
- **Source File**: `backend/platform/services/policy_engine.py`
- **Purpose**: Evaluates Member 1's acoustic risk decision in the context of enterprise rules, VIP identity roles (CFO, CEO), sensitive intent categories, and organization-configured thresholds.

---

## 2. Policy Evaluation Schema (`PolicyEvaluationResult`)

```python
@dataclass(frozen=True)
class PolicyEvaluationResult:
    risk_score: float
    risk_level: str               # SAFE, LOW, MEDIUM, HIGH, CRITICAL
    scenario: str                 # AI_CLONE_ENROLLED_SPEAKER, etc.
    should_warn_user: bool
    should_alert_org: bool
    should_create_incident: bool
    is_blocked: bool
    recommended_action: str
    reasons: List[str]
    warning_message: Optional[str]
```

---

## 3. Class: `PolicyEngine`

### `evaluate(telemetry, policy=None, protected_identity=None) -> PolicyEvaluationResult`

#### Execution Steps:
1. **Threshold Extraction**:
   - High risk threshold (default: $70.0$, or from `policy.risk_score_high_threshold`).
   - Critical risk threshold (default: $85.0$, or from `policy.risk_score_critical_threshold`).
2. **VIP Role Escalation**:
   - Inspects `protected_identity`.
   - If `protected_identity.risk_priority == "CRITICAL"` (e.g. Chief Financial Officer):
     - If speech is synthetic (`synthetic_prob >= 0.50`) or speaker mismatched:
       - Sets `final_risk_score = max(score, 95.0)`.
       - Sets `final_risk_level = "CRITICAL"`.
       - Injects audit reason: `"PROTECTED IDENTITY ALERT: Impersonation attempt detected against {title} ({full_name})."`.
3. **Sensitive Intent Escalation**:
   - If `telemetry.intent in ["OTP_REQUEST", "PAYMENT_TRANSFER", "CREDENTIAL_REQUEST", "URGENT_REQUEST"]`:
     - If synthetic probability is elevated ($> 0.40$):
       - Sets `final_risk_score = max(score, 90.0)`.
       - Sets `final_risk_level = "CRITICAL"`.
       - Injects audit reason: `"SENSITIVE INTENT ALERT: High-risk conversation intent '{intent}' combined with suspicious acoustic metrics."`.
4. **Action & Alert Flags**:
   - If `final_risk_level in ["HIGH", "CRITICAL"]`:
     - `should_warn_user = True`
     - `should_alert_org = True`
     - `should_create_incident = True`
   - If `policy.auto_block_critical_clones is True` and `final_risk_level == "CRITICAL"`:
     - `is_blocked = True`
     - `recommended_action = "BLOCK_CALL"`

---

## 4. Source Files Covered
- `backend/platform/services/policy_engine.py`
- `backend/platform/db/models.py`
