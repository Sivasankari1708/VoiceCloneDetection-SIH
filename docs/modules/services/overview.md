# Module: Backend Platform Services Overview

**Package**: `backend.platform.services`

---

## 1. Purpose of the Services Layer

The services layer encapsulates core domain logic, security orchestration, biometric management, multi-tenant WebSocket alert dispatching, and integration with Member 1's AI audio pipeline. It sits between the API controllers (`backend/platform/server/routes/`) and persistence models (`backend/platform/db/models.py`).

---

## 2. Inventory of Service Components

| Service Module | Key Classes / Functions | Primary Responsibility |
| :--- | :--- | :--- |
| [`orchestrator.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/orchestrator.py) | `SecurityOrchestrator` | Session lifecycle, per-chunk audio processing, incident deduplication, dual alert dispatching, operator action execution |
| [`ai_adapter.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/ai_adapter.py) | `AIAdapter`, `ProcessedChunkTelemetry` | Adapts frozen Member 1 AI models into async backend pipelines; performs in-memory audio normalization |
| [`alert_dispatcher.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/alert_dispatcher.py) | `AlertDispatcher` | Singleton WebSocket hub routing audio telemetry to caller sessions and real-time security alerts to SOC operators |
| [`policy_engine.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/policy_engine.py) | `PolicyEngine`, `PolicyEvaluationResult` | Applies organizational policy, VIP CFO rules, and sensitive intent escalation on top of AI risk scores |
| [`auth_service.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/auth_service.py) | `hash_password`, `verify_password`, `create_access_token`, `decode_access_token` | PBKDF2 password security and PyJWT bearer token creation and parsing |
| [`speaker_service.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/speaker_service.py) | `SpeakerService` | Biometric enrollment coordinator wrapping Member 1's `SpeakerEnrollmentService` and database repository adapter |

---

## 3. Inter-Service Architecture

```
[ WebSocket / REST Controller ]
          │
          ▼
┌────────────────────────────────────────────────────────┐
│                  SecurityOrchestrator                  │
└────────────┬──────────────┬──────────────┬─────────────┘
             │              │              │
             ▼              ▼              ▼
     ┌──────────────┐ ┌────────────┐ ┌──────────────┐
     │  AIAdapter   │ │PolicyEngine│ │AlertDispatcher│
     └──────┬───────┘ └────────────┘ └──────────────┘
            │
            ▼ (Member 1 Frozen AI)
     StreamingAudioPipeline / RiskEngine
```

---

## 4. Documentation Links

- Detailed `SecurityOrchestrator`: [orchestrator.md](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/modules/services/orchestrator.md)
- Detailed `AIAdapter`: [ai_adapter.md](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/modules/services/ai_adapter.md)
- Detailed `AlertDispatcher`: [alert_dispatcher.md](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/modules/services/alert_dispatcher.md)
- Detailed `PolicyEngine`: [policy_engine.md](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/modules/services/policy_engine.md)
- Detailed `AuthService`: [auth_service.md](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/modules/services/auth_service.md)
- Detailed `SpeakerService`: [speaker_service.md](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/docs/modules/services/speaker_service.md)
