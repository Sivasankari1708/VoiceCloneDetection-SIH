# Architecture Overview: Member 2 Platform & Security Orchestration

## 1. System Role & Scope

In the **VoiceCloneDetection-SIH** system, **Member 2** is responsible for the **Backend Application, Platform, and Security Orchestration** layer. 

While Member 1 developed the AI intelligence core (Silero VAD, DeepfakeCNN v2, SpeechBrain ECAPA-TDNN, Faster-Whisper, and IntentDetector), Member 2 transforms these algorithmic components into a multi-tenant enterprise security platform.

The primary mission of Member 2 is implementing the end-to-end detection, alerting, and mitigation lifecycle:
$$\text{Voice Stream} \longrightarrow \text{AI Telemetry} \longrightarrow \text{Security Policy} \longrightarrow \left[\begin{array}{l}\text{User Warning}\\\text{SOC Alert}\end{array}\right] \longrightarrow \text{Incident} \longrightarrow \text{Mitigation Action} \longrightarrow \text{Audit Log}$$

---

## 2. Core Operational Pillars

The Member 2 platform is structured around six core pillars:

1. **AI Integration Adapter**:
   - Encapsulated by `AIAdapter` in `backend/platform/services/ai_adapter.py`.
   - Bridges raw browser audio input to Member 1's frozen `StreamingAudioPipeline` and `InferencePipeline`.
   - Normalizes audio in-memory and translates internal Member 1 results into standardized platform DTOs.

2. **Call Session Management**:
   - Managed by `SecurityOrchestrator` in `backend/platform/services/orchestrator.py`.
   - Tracks incoming call metadata, caller name, caller number, claimed speaker identity, chunk sequences, timestamps, and active state.

3. **Multi-Tenant Persistence Layer**:
   - Built on SQLAlchemy with models defined in `backend/platform/db/models.py`.
   - Configured for PostgreSQL with zero-configuration automated fallback to local SQLite.
   - Houses organizations, users, protected identities, speaker biometric embeddings, call sessions, risk events, security incidents, actions, and audit trails.

4. **Security Policy & Risk Decision Engine**:
   - Managed by `PolicyEngine` in `backend/platform/services/policy_engine.py`.
   - Combines acoustic risk scores from Member 1's `RiskEngine` with organizational context.
   - Implements automated VIP role escalation (e.g., CFO voice clone) and sensitive intent escalation (`OTP_REQUEST`, `PAYMENT_TRANSFER`).

5. **Real-Time Dual Alert Dispatch**:
   - Managed by `AlertDispatcher` in `backend/platform/services/alert_dispatcher.py`.
   - Concurrently routes `USER_SECURITY_ALERT` to the caller's private WebSocket session and `ORGANIZATION_SECURITY_ALERT` to the organization's SOC console channel.

6. **Incident Management & Operator Mitigation**:
   - Handles deduplicated incident lifecycles (`OPEN` $\rightarrow$ `UNDER_REVIEW` $\rightarrow$ `CONFIRMED_ATTACK` / `FALSE_POSITIVE` $\rightarrow$ `RESOLVED`).
   - Supports operator mitigation actions, including simulated `BLOCK_CALL`, line termination, and complete audit logging.

---

## 3. High-Level Component Topology

```
                  ┌────────────────────────────────────────────────────────┐
                  │                 FRONTEND CONSUMERS                     │
                  │  Member 3 (Employee UI)    Member 4 (SOC Dashboard)    │
                  └──────────────┬──────────────────────────▲──────────────┘
                                 │                          │
                                 │ REST / WebSocket         │ WebSocket Alerts
                                 ▼                          │
┌───────────────────────────────────────────────────────────┴──────────────────────────────────────────────────────────┐
│                                          MEMBER 2 PLATFORM LAYER                                                     │
│                                                                                                                      │
│   ┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐   ┌───────────────────────┐   │
│   │   FastAPI Server       │   │  Security Orchestrator │   │  Security Policy       │   │   SQL Database        │   │
│   │   REST Routes & WS     │──▶│  Session & Incidents   │──▶│  Engine (VIP & Rules)  │──▶│   PostgreSQL / SQLite │   │
│   └────────────────────────┘   └───────────┬────────────┘   └────────────────────────┘   └───────────────────────┘   │
│                                            │                                                                         │
│                                            ▼                                                                         │
│                                ┌────────────────────────┐                                                            │
│                                │   AI Adapter Bridge    │                                                            │
│                                │   (Singleton Wrapper)  │                                                            │
│                                └───────────┬────────────┘                                                            │
└────────────────────────────────────────────┼─────────────────────────────────────────────────────────────────────────┘
                                             │
                                             ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   MEMBER 1 AI LAYER (READ-ONLY / FROZEN)                                             │
│                                                                                                                      │
│   ┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────┐   ┌───────────────────────┐   │
│   │      Silero VAD        │   │   DeepfakeCNN v2       │   │   SpeechBrain ECAPA    │   │  Faster-Whisper       │   │
│   │   (Voice Activity)     │   │   (ASVspoof 2019 LA)   │   │   (Speaker Verifier)   │   │  (ASR Transcription)  │   │
│   └────────────────────────┘   └────────────────────────┘   └────────────────────────┘   └───────────────────────┘   │
│                                            │                                                         │               │
│                                            ▼                                                         ▼               │
│                                ┌────────────────────────┐                                ┌───────────────────────┐   │
│                                │      RiskEngine        │◀───────────────────────────────│     IntentDetector    │   │
│                                │  (Acoustic Decisions)  │                                │  (Social Engineering) │   │
│                                └────────────────────────┘                                └───────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Architectural Boundaries & Isolation

### Read-Only Invariant for Member 1
Member 1 code is strictly frozen. Member 2 interacts with Member 1 exclusively through public class contracts:
- `backend.pipeline.streaming_pipeline.StreamingAudioPipeline`
- `backend.pipeline.inference_pipeline.InferencePipeline`
- `backend.pipeline.risk_engine.RiskEngine`
- `backend.models.speaker_enrollment.SpeakerEnrollmentService`
- `backend.models.speaker_repository.BaseSpeakerRepository`

Member 2 does not alter model weights, preprocessing thresholds, feature extractors, or risk engine mathematical formulas.

### Tenant Isolation Boundary
All queries and events are scoped by `org_id`. Cross-tenant data sharing is prevented at both the database query level and the WebSocket broadcast layer.

---

## 5. Source Files Covered
- `backend/platform/server/app.py`
- `backend/platform/services/orchestrator.py`
- `backend/platform/services/ai_adapter.py`
- `backend/platform/services/policy_engine.py`
- `backend/platform/services/alert_dispatcher.py`
- `backend/platform/db/models.py`
