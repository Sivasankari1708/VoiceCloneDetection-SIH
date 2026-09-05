# Module Dependency Map

## 1. Inter-Module Dependency Graph

```mermaid
graph TD
    subgraph ServerLayer["server/"]
        app["app.py"]
        deps["dependencies.py"]
        subgraph Routes["routes/"]
            r_auth["auth.py"]
            r_org["organizations.py"]
            r_id["protected_identities.py"]
            r_call["calls.py"]
            r_inc["incidents.py"]
            r_pol["policies.py"]
            r_aud["audit.py"]
            r_hlth["health.py"]
            r_anlz["analyze.py"]
            r_ws["websocket_stream.py"]
        end
    end

    subgraph ServicesLayer["services/"]
        orch["orchestrator.py"]
        ai_adp["ai_adapter.py"]
        disp["alert_dispatcher.py"]
        pol_eng["policy_engine.py"]
        auth_svc["auth_service.py"]
        spk_svc["speaker_service.py"]
    end

    subgraph DBLayer["db/"]
        models["models.py"]
        session["session.py"]
        spk_repo["speaker_repo_adapter.py"]
    end

    subgraph SchemasLayer["schemas/"]
        s_auth["auth.py"]
        s_org["organizations.py"]
        s_id["protected_identities.py"]
        s_call["calls.py"]
        s_inc["incidents.py"]
        s_pol["policies.py"]
        s_aud["audit.py"]
        s_ev["events.py"]
    end

    subgraph ConfigLayer["config.py"]
        cfg["PlatformConfig"]
    end

    subgraph Member1["backend/ (Member 1 - Frozen)"]
        m1_pipe["pipeline/streaming_pipeline.py"]
        m1_inf["pipeline/inference_pipeline.py"]
        m1_risk["pipeline/risk_engine.py"]
        m1_enr["models/speaker_enrollment.py"]
        m1_repo["models/speaker_repository.py"]
    end

    app --> Routes
    app --> session
    Routes --> deps
    Routes --> ServicesLayer
    Routes --> SchemasLayer

    deps --> auth_svc
    deps --> session
    deps --> models

    orch --> ai_adp
    orch --> disp
    orch --> pol_eng
    orch --> models
    orch --> session
    orch --> s_ev
    orch --> s_inc
    orch --> s_call

    ai_adp --> m1_pipe
    ai_adp --> m1_inf

    spk_svc --> spk_repo
    spk_svc --> m1_enr
    spk_repo --> m1_repo
    spk_repo --> models

    models --> session
    session --> cfg
```

---

## 2. Dependency Invariants & Layering Rules

1. **No Circular Dependencies**:
   - `schemas/` depends only on Pydantic and standard library. Never imports from `services/`, `server/`, or `db/`.
   - `db/` depends on SQLAlchemy and standard library. `models.py` never imports from `services/` or `server/`.
   - `services/` depends on `db/`, `schemas/`, `config.py`, and Member 1 AI models.
   - `server/` depends on `services/`, `schemas/`, `db/`, and `dependencies.py`.
2. **Member 1 Isolation**:
   - Only `AIAdapter` (`services/ai_adapter.py`) and `DatabaseSpeakerRepository` (`db/speaker_repo_adapter.py`) directly import Member 1 AI modules.
   - All other platform files consume Member 2 DTOs and adapters.

---

## 3. Source Files Covered
- `backend/platform/config.py`
- `backend/platform/db/*`
- `backend/platform/schemas/*`
- `backend/platform/services/*`
- `backend/platform/server/*`
