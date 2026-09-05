# Risk Orchestration: Decision Matrix & Action Selection

## 1. Decision Matrix

The platform synthesizes Member 1's acoustic outputs with Member 2's organizational governance:

| Scenario / Threat Condition | Acoustic Indicators | Intent Marker | Organization Context | Risk Level | Selected Action | User Warning | SOC Alert | Incident Opened |
|---|---|---|---|:---:|---|:---:|:---:|:---:|
| **Genuine Enrolled Caller** | Synth < 0.15, Sim > 0.80 | Any | Any | `SAFE` | `ALLOW` | No | No | No |
| **Silence / Non-Speech** | VAD=False | None | Any | `SAFE` | `MONITOR` | No | No | No |
| **Inconclusive Acoustics** | 0.30 $\le$ Synth $\le$ 0.50 | `NORMAL_CONVERSATION` | Standard User | `MEDIUM` | `VERIFY_SPEAKER` | No | Caution | No |
| **Imposter (Mismatch)** | Synth < 0.20, Sim < 0.60 | `NORMAL_CONVERSATION` | Standard User | `HIGH` | `WARN_USER` | Yes | Yes | Yes |
| **Imposter + Sensitive Request** | Synth < 0.20, Sim < 0.60 | `OTP_REQUEST` | Standard User | `HIGH` | `REQUIRE_ADDITIONAL_VERIFICATION` | Yes | Yes | Yes |
| **Unknown AI Voice** | Synth > 0.85, Unenrolled | Any | Any | `HIGH` | `WARN_USER` | Yes | Yes | Yes |
| **AI Clone of Enrolled VIP** | Synth > 0.80, Sim > 0.80 | Any | VIP (CFO / CEO) | `CRITICAL` | `BLOCK_OR_ESCALATE` | Yes | Yes | Yes |
| **AI Clone + Wire Transfer** | Synth > 0.80, Sim > 0.80 | `PAYMENT_TRANSFER` | VIP (CFO / CEO) | `CRITICAL` | `BLOCK_CALL` (if auto-block on) | Yes | Yes | Yes |

---

## 2. Action Selection Hierarchy

1. `ALLOW`: Call continues uninterrupted.
2. `MONITOR`: Telemetry recorded in `risk_events` without alerting.
3. `VERIFY_SPEAKER`: Yellow warning in telemetry payload; suggests requesting out-of-band confirmation.
4. `WARN_USER`: Pushes immediate `USER_SECURITY_ALERT` banner to call recipient.
5. `REQUIRE_ADDITIONAL_VERIFICATION`: Flags incident; instructs employee to hang up and verify via corporate channels.
6. `BLOCK_OR_ESCALATE`: Critical threat; pushes concurrent dual alerts and flags incident for immediate operator intervention.
7. `BLOCK_CALL`: Immediate simulated line drop (`status = "TERMINATED_BY_SECURITY"`).

---

## 3. Source Files Covered
- `backend/platform/services/policy_engine.py`
- `backend/pipeline/risk_engine.py`
- `backend/platform/services/orchestrator.py`
