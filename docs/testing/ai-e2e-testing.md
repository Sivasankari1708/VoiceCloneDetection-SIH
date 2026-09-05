# Testing: AI End-to-End Testing

This document details end-to-end integration testing connecting platform audio ingestion, real Member 1 neural models, and downstream security orchestration.

---

## 1. Scope & Objective

AI End-to-End testing verifies that:
1. Audio streamed through the backend platform reaches Member 1's `StreamingAudioPipeline` intact.
2. Acoustic and biometric inferences execute without memory leaks, shape mismatches, or sample rate conversion errors.
3. Downstream `RiskEngine` and `PolicyEngine` evaluate the AI output and trigger operational responses.

---

## 2. Test Scenarios Evaluated

Three core scenarios are evaluated in [`backend/platform/tests/test_e2e_scenarios.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/tests/test_e2e_scenarios.py):

### Scenario 1: Genuine Enrolled Executive
- **Caller Context**: Enrolled speaker `LA_0069` (CFO).
- **Acoustic Characteristics**: Natural human voice, genuine acoustic features, high speaker similarity ($> 0.85$).
- **AI Telemetry**: `synthetic_probability < 0.10`, `speaker_match = True`, `verdict = "genuine"`.
- **System Outcome**: `risk_score < 15.0`, `risk_level = "SAFE"`, `recommended_action = "ALLOW"`. 0 incidents generated.

### Scenario 2: AI Voice Clone Impersonating CFO (Attack)
- **Caller Context**: Fraudulent caller claiming to be `LA_0069` (CFO).
- **Acoustic Characteristics**: Cloned voice synthesized using deep learning, matching vocal timbre of CFO with high biometric similarity ($0.8995$), but containing synthetic artifacts.
- **AI Telemetry**: `synthetic_probability = 0.9995`, `speaker_similarity = 0.8995`, `speaker_match = True`, `verdict = "cloned"`.
- **System Outcome**:
  - `risk_score = 98.0`, `risk_level = "CRITICAL"`, `recommended_action = "BLOCK_OR_ESCALATE"`.
  - Immediate `USER_SECURITY_ALERT` sent to employee.
  - Immediate `ORGANIZATION_SECURITY_ALERT` sent to SOC.
  - Security incident `inc-...` created in `security_incidents`.
  - Security operator triggers `BLOCK_CALL`, ending active call session.

### Scenario 3: Imposter Caller (Different Genuine Speaker)
- **Caller Context**: Caller claims to be `LA_0069`, but is actually an unauthorized individual speaking naturally.
- **Acoustic Characteristics**: Natural human voice (`synthetic_probability < 0.10`), but vocal embedding does not match enrolled CFO profile (`speaker_similarity = 0.32`).
- **AI Telemetry**: `verdict = "imposter"`, `identity_status = "MISMATCHED"`.
- **System Outcome**: `risk_score = 80.0`, `risk_level = "HIGH"`, `recommended_action = "REQUIRE_ADDITIONAL_VERIFICATION"`.

---

## 3. Real Model Execution Performance

When evaluated with real Member 1 models on CPU:
- **VAD Latency**: $\approx 5\text{ ms}$ per chunk
- **ECAPA Speaker Embedding**: $\approx 45\text{ ms}$ per chunk
- **DeepfakeCNN v2 Inference**: $\approx 28\text{ ms}$ per chunk
- **Faster-Whisper Transcription**: $\approx 120\text{ ms}$ per chunk
- **Total Pipeline Latency**: $\approx 200 - 250\text{ ms}$ per 1-second chunk
- **Real-Time Factor (RTF)**: $\approx 0.20 - 0.25$ (Comfortably real-time, well below the 1.0 threshold).
