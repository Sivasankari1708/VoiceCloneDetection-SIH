# Inference to Risk Flow: From Neural Predictions to Security Policy

## 1. Flow Pipeline

The transformation from raw acoustic feature maps to organizational security decisions is multi-layered:

```
[Raw Audio Chunk (1.0s)]
       │
       ├─────────────────────────────────┬─────────────────────────────────┐
       ▼                                 ▼                                 ▼
Silero VAD                       Log-Mel Features                   ECAPA-TDNN
(Speech vs Silence)              (80 Mel Filters)                   (192-D Embedding)
       │                                 │                                 │
       ▼                                 ▼                                 ▼
Speech Probability                DeepfakeCNN v2                    Cosine Similarity
(e.g. 0.993)                     (ASVspoof 2019 LA)                vs Enrolled Ref
       │                                 │                         (e.g. 0.8995 -> MATCH)
       │                                 ▼                                 │
       │                         Synthetic Probability                     │
       │                         (e.g. 0.9995)                             │
       │                                 │                                 │
       └─────────────────────────────────┼─────────────────────────────────┘
                                         ▼
                                Member 1 RiskEngine
                                         │
                             ┌───────────┴───────────┐
                             │   Intent & Keywords   │ (Whisper ASR + IntentDetector)
                             │   (e.g. OTP_REQUEST)  │
                             └───────────┬───────────┘
                                         ▼
                               RiskDecision (Member 1)
                                 - Score: 95.0
                                 - Level: CRITICAL
                                 - Scenario: AI_CLONE_ENROLLED_SPEAKER
                                         │
                                         ▼
                               Member 2 PolicyEngine
                                 - Matches claimed speaker against VIP (CFO)
                                 - Checks auto-block configuration
                                 - Emits should_warn_user=True, should_alert_org=True
                                         │
                                         ▼
                               SecurityOrchestrator
                                 - Incident created in DB
                                 - Dual alerts pushed over WebSockets
```

---

## 2. Risk Engine Mathematics (Member 1)

Located in `backend/pipeline/risk_engine.py`:

$$S_{\text{synthetic}} = (\text{synth\_prob})^{1.5} \times 50.0 + \text{penalty}_{\text{clone}}$$
Where:
- $\text{penalty}_{\text{clone}} = 25.0$ if high synthetic probability coincides with speaker biometric match (voice clone impersonation attack).
- If speaker mismatch: speaker penalty of $50.0$ is added.
- If sensitive intent detected (`OTP_REQUEST` or `PAYMENT_TRANSFER`): intent component adds up to $25.0$.
- Total composite risk score:
  $$\text{RiskScore} = \min(100.0, S_{\text{synthetic}} + S_{\text{speaker}} + S_{\text{intent}})$$

---

## 3. Policy Engine Layer (Member 2)

Located in `backend/platform/services/policy_engine.py`:

```python
# Check for protected identity (VIP: CFO, CEO)
if protected_identity and protected_identity.risk_priority == "CRITICAL":
    if is_clone_or_imposter:
        final_risk_score = max(final_risk_score, 95.0)
        final_risk_level = "CRITICAL"
        reasons.append(f"PROTECTED IDENTITY ALERT: Impersonation attempt detected against {protected_identity.title} ({protected_identity.full_name}).")
        should_alert_org = True
        should_create_incident = True
```

The Policy Engine bridges mathematical acoustic modeling with organizational risk governance.

---

## 4. Source Files Covered
- `backend/pipeline/risk_engine.py`
- `backend/platform/services/policy_engine.py`
- `backend/platform/services/orchestrator.py`
