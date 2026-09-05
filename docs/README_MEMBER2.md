# Member 2 — Backend, Platform & Security Orchestration

**Smart India Hackathon (SIH) Prototype: AI Real-Time Detection & Prevention of Voice-Cloning Impersonation Attacks**

[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688.svg)](https://fastapi.tiangolo.com/)
[![WebSockets](https://img.shields.io/badge/WebSockets-Real--Time-success.svg)](https://websockets.readthedocs.io/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-PostgreSQL%20%2F%20SQLite-red.svg)](https://www.sqlalchemy.org/)
[![Tests](https://img.shields.io/badge/Member%202%20Tests-20%2F20%20Passing%20(100%25)-brightgreen.svg)](backend/platform/tests/)
[![Architecture](https://img.shields.io/badge/Member%201%20Code-FROZEN%20%26%20READ--ONLY-orange.svg)](#non-negotiable-rule--member-1-code-is-frozen)

---

## Table of Contents

- [1. Executive Summary](#1-executive-summary)
- [2. Architectural Compliance & Golden Rule](#2-architectural-compliance--golden-rule)
- [3. End-to-End System Architecture](#3-end-to-end-system-architecture)
- [4. The Canonical SIH Demonstration Scenario](#4-the-canonical-sih-demonstration-scenario)
- [5. Platform Directory Structure](#5-platform-directory-structure)
- [6. Database Architecture & Data Models](#6-database-architecture--data-models)
- [7. AI Integration Adapter Layer](#7-ai-integration-adapter-layer)
- [8. Security Policy Engine & Risk Decision Matrix](#8-security-policy-engine--risk-decision-matrix)
- [9. Real-Time Dual Alert Dispatch Engine](#9-real-time-dual-alert-dispatch-engine)
- [10. Incident Management & Deduplication Lifecycle](#10-incident-management--deduplication-lifecycle)
- [11. Security Operator Actions (Simulated Mitigation)](#11-security-operator-actions-simulated-mitigation)
- [12. Biometric Speaker Enrollment Integration](#12-biometric-speaker-enrollment-integration)
- [13. Complete REST API Reference](#13-complete-rest-api-reference)
- [14. WebSocket API & Real-Time Event Contracts](#14-websocket-api--real-time-event-contracts)
- [15. Authentication, RBAC & Multi-Tenant Isolation](#15-authentication-rbac--multi-tenant-isolation)
- [16. Installation & Configuration Guide](#16-installation--configuration-guide)
- [17. Running the Platform](#17-running-the-platform)
- [18. Automated Test Suite & Verification Results](#18-automated-test-suite--verification-results)
- [19. Handover & Integration Guide for Members 3 & 4](#19-handover--integration-guide-for-members-3--4)
- [20. Scope, Boundaries & Operational Limitations](#20-scope-boundaries--operational-limitations)

---

## 1. Executive Summary

Member 2 is responsible for the **Backend Application, Platform, and Security Orchestration** layer of the SIH Voice Clone Detection prototype.

While Member 1 constructed the deep learning and audio intelligence models (VAD, Deepfake CNN, ECAPA-TDNN Speaker Verification, Faster-Whisper ASR, Intent Classification, and Risk Engine), Member 2 operationalizes this AI core into an enterprise security platform.

The platform transforms raw inference signals into actionable organizational security workflows:
$$\text{Incoming Voice} \longrightarrow \text{AI Telemetry} \longrightarrow \text{Policy Decision} \longrightarrow \left[ \begin{array}{l} \text{User Warning} \\ \text{SOC Alert} \end{array} \right] \longrightarrow \text{Incident} \longrightarrow \text{Operator Mitigation} \longrightarrow \text{Audit Log}$$

---

## 2. Architectural Compliance & Golden Rule

### Non-Negotiable Rule: Member 1 Code is Frozen & Read-Only

> **MEMBER 1'S EXISTING AI CODE IS READ-ONLY AND HAS NOT BEEN MODIFIED.**

Every class, function, checkpoint, and test authored by Member 1 remains unaltered:
- `backend/audio/` (Audio decoding, preprocessing, Silero VAD)
- `backend/intent/` (Intent detection, keyword definitions)
- `backend/models/` (Deepfake CNN v2, ECAPA-TDNN verifier, Whisper ASR, speaker enrollment)
- `backend/pipeline/` (`InferencePipeline`, `StreamingAudioPipeline`, `RiskEngine`)
- `backend/schemas/` (Member 1 inference schemas)
- `backend/utils/` (`logger.py`)
- `backend/tests/` (Member 1 unit tests)

### How Member 2 Bridges the Gap
Any integration differences (such as audio buffer formats, database storage of embeddings, or event schemas) are resolved using **New Adapters, Wrappers, DTOs, and Services** residing strictly inside `backend/platform/`.

---

## 3. End-to-End System Architecture

```
                 USER CALL RECIPIENT                     ENTERPRISE SOC / OPERATOR
                  (Browser Microphone)                    (Security Operations Center)
                           │                                          │
                           │ Audio Chunks (WS)                        │ Alerts & Incidents (WS)
                           ▼                                          ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        FASTAPI BACKEND PLATFORM (Member 2)                             │
│                                                                                        │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────────────┐  │
│  │  REST API Endpoints   │  │  WebSocket Stream     │  │  WebSocket SOC Alerts      │  │
│  │  (/api/calls, auth,   │  │  (/ws/stream/{id})    │  │  (/ws/org/{id}/alerts)     │  │
│  │   incidents, etc.)    │  │                       │  │                            │  │
│  └───────────┬───────────┘  └───────────┬───────────┘  └─────────────▲──────────────┘  │
│              │                          │                            │                 │
│              │                          ▼                            │                 │
│              │              ┌───────────────────────┐                │                 │
│              │              │  Security Orchestrator│                │                 │
│              │              │  (Session Management, │                │                 │
│              │              │   Alert Dispatcher)   │────────────────┘                 │
│              │              └───────────┬───────────┘                                  │
│              ▼                          │                                              │
│  ┌───────────────────────┐              ▼                                              │
│  │  SQLAlchemy Database  │  ┌───────────────────────┐                                  │
│  │  PostgreSQL / SQLite  │  │ Security Policy Engine│                                  │
│  │  (Multi-Tenant Data)  │  │ (VIP Escalation, Org  │                                  │
│  └───────────────────────┘  │  Rule Thresholds)     │                                  │
│                             └───────────▲───────────┘                                  │
│                                         │                                              │
│                            Normalized Telemetry DTO                                    │
│                                         │                                              │
│                             ┌───────────┴───────────┐                                  │
│                             │   AI Adapter Wrapper  │                                  │
│                             │   (Singleton Bridge)  │                                  │
│                             └───────────▲───────────┘                                  │
└─────────────────────────────────────────┼──────────────────────────────────────────────┘
                                          │
                                          ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        MEMBER 1 AI LAYER (READ-ONLY & FROZEN)                          │
│                                                                                        │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────┐  │
│  │   Silero VAD      │  │  Deepfake CNN v2  │  │   ECAPA-TDNN      │  │ Faster-     │  │
│  │   (Voice Gating)  │  │  (ASVspoof 2019)  │  │   (VoxCeleb spk)  │  │ Whisper ASR │  │
│  └─────────┬─────────┘  └─────────┬─────────┘  └─────────┬─────────┘  └──────┬──────┘  │
│            │                      │                      │                   │         │
│            └──────────────────────┼──────────────────────┴───────────────────┘         │
│                                   ▼                                                    │
│                        ┌─────────────────────┐   ┌───────────────────────────┐         │
│                        │     Risk Engine     │   │   Intent Classification   │         │
│                        │ (Multi-Factor Score)│   │  (OTP / Urgent / Wire)    │         │
│                        └─────────────────────┘   └───────────────────────────┘         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. The Canonical SIH Demonstration Scenario

### Threat Model: AI-Cloned CFO Wire Transfer Attack

The ultimate demonstration of this platform simulates an enterprise imposter attack:
1. **Target Identity**: David Vance (Chief Financial Officer, speaker ID `LA_0069`).
2. **Victim**: An employee in finance/accounting (`username="employee"`).
3. **Attack Vector**: High-grade synthetic voice clone (synthesizing CFO's pitch, timbre, and cadence).
4. **Social Engineering Hook**: Urgent request for an OTP or emergency wire transfer.

### Sequence of Events

```mermaid
sequenceDiagram
    autonumber
    actor Attacker as AI-Cloned CFO
    actor Victim as Employee (User Client)
    participant WS as /ws/stream/{session_id}
    participant Orch as Security Orchestrator
    participant M1 as Member 1 AI Pipeline
    participant DB as PostgreSQL Database
    actor SOC as Security Operator (SOC Console)

    Victim->>WS: Start Call Session (Claimed Speaker: LA_0069)
    Attacker->>Victim: Synthetic Voice: "Transfer $250k urgently and share OTP"
    Victim->>WS: Stream Audio Chunk (PCM / WAV)
    WS->>Orch: Ingest Chunk(chunk_id, audio_bytes)
    Orch->>M1: StreamingAudioPipeline.process_chunk()
    M1-->>Orch: Verdict='cloned', RawSynth=0.999, SpeakerMatch=True, Intent='OTP_REQUEST'
    Orch->>Orch: PolicyEngine: Protected VIP (CFO) + Synthetic -> Escalates to CRITICAL
    
    par Dual Real-Time Alert Dispatch
        Orch->>Victim: WebSocket Event: USER_SECURITY_ALERT (Immediate Warning Banner)
        Orch->>SOC: WebSocket Event: ORGANIZATION_SECURITY_ALERT (High Priority Alarm)
    end
    
    Orch->>DB: Persist RiskEvent & Create SecurityIncident (Severity: CRITICAL, Status: OPEN)
    Orch->>DB: Record AuditLog (CRITICAL_RISK_DETECTED, USER_ALERT_SENT, ORG_ALERT_SENT)
    
    SOC->>Orch: POST /api/incidents/{id}/action (Action: CONFIRM_ATTACK + BLOCK_CALL)
    Orch->>DB: Update Incident (CONFIRMED_ATTACK) & Log Action
    Orch->>Victim: WebSocket Event: CALL_ENDED (Reason: BLOCKED_BY_SECURITY)
    Orch->>SOC: WebSocket Event: SECURITY_ACTION & INCIDENT_UPDATED
```

---

## 5. Platform Directory Structure

The complete backend platform layer resides in [`backend/platform/`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/):

```
backend/platform/
├── __init__.py
├── config.py                         # Environment variables, JWT secret, DB URLs, thresholds
├── db/
│   ├── __init__.py
│   ├── models.py                     # SQLAlchemy multi-tenant schema (9 core tables)
│   ├── session.py                    # Engine initialization, SessionLocal & automatic seeding
│   └── speaker_repo_adapter.py       # DatabaseSpeakerRepository adapting BaseSpeakerRepository
├── schemas/
│   ├── __init__.py
│   ├── auth.py                       # User Login, Register, Profile, Token DTOs
│   ├── organizations.py              # Organization & tenant schemas
│   ├── protected_identities.py       # VIP enrollment DTOs (CFO, Executive, etc.)
│   ├── calls.py                      # Call session start/end and history DTOs
│   ├── incidents.py                  # Security incident summaries and operator action inputs
│   ├── events.py                     # Stable WebSocket event contracts (8 event types)
│   ├── policies.py                   # Dynamic organization security policy DTOs
│   └── audit.py                      # Audit log schemas
├── services/
│   ├── __init__.py
│   ├── auth_service.py               # Password hashing (PBKDF2-HMAC-SHA256) & PyJWT tokens
│   ├── ai_adapter.py                 # Singleton adapter wrapping Member 1 AI pipelines
│   ├── policy_engine.py              # Organizational risk policy & VIP escalation evaluator
│   ├── alert_dispatcher.py           # Multi-tenant WebSocket connection manager & router
│   ├── speaker_service.py            # Multi-sample speaker enrollment service
│   └── orchestrator.py               # Central Security Orchestrator (Session & Incident master)
├── server/
│   ├── __init__.py
│   ├── dependencies.py               # FastAPI DI: DB session, JWT auth, RBAC role guard
│   ├── app.py                        # FastAPI application factory, CORS, Lifespan setup
│   └── routes/
│       ├── __init__.py
│       ├── auth.py                   # Authentication REST routes
│       ├── organizations.py          # Tenant information routes
│       ├── protected_identities.py   # VIP identity management & biometric enrollment routes
│       ├── calls.py                  # Call session management & history routes
│       ├── incidents.py              # SOC incident queue & operator mitigation routes
│       ├── policies.py               # Security policy configuration routes
│       ├── audit.py                  # Security audit trail routes
│       ├── health.py                 # Health probe & live operational statistics routes
│       ├── analyze.py                # Batch audio file analysis route
│       └── websocket_stream.py       # WebSocket streaming & SOC alert endpoints
└── tests/
    ├── __init__.py
    ├── test_db.py                    # Database schema, foreign keys & speaker repo tests
    ├── test_auth.py                  # Authentication & RBAC role enforcement tests
    ├── test_api.py                   # REST endpoints integration tests
    ├── test_orchestrator.py          # Policy escalation, deduplication & operator action tests
    ├── test_websocket.py             # Live WebSocket streaming & dual alert tests
    └── test_e2e_scenarios.py         # End-to-End Real Audio Scenarios (Genuine, Cloned, Imposter)
```

---

## 6. Database Architecture & Data Models

The database is built with SQLAlchemy and supports both **PostgreSQL** (`postgresql+asyncpg://...` or `psycopg2`) and **SQLite** (automatic zero-config fallback for local testing).

### Entity-Relationship Diagram

```
┌─────────────────────┐
│    Organization     │
│─────────────────────│
│ id (PK)             │
│ name                │
│ code (UNIQUE)       │
│ is_active           │
└──────────┬──────────┘
           │ 1:N
           ├───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
           ▼                               ▼                               ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐         ┌─────────────────────┐
│        User         │         │  ProtectedIdentity  │         │     CallSession     │         │   SecurityPolicy    │
│─────────────────────│         │─────────────────────│         │─────────────────────│         │─────────────────────│
│ id (PK)             │         │ id (PK)             │         │ id (PK)             │         │ id (PK)             │
│ org_id (FK)         │         │ org_id (FK)         │         │ session_id (UNIQUE) │         │ org_id (FK)         │
│ username (UNIQUE)   │         │ full_name           │         │ org_id (FK)         │         │ high_risk_thresh    │
│ hashed_password     │         │ title (e.g. "CFO")  │         │ user_id (FK)        │         │ critical_risk_thresh│
│ role (USER/SOC/ADM) │         │ speaker_id (UNIQUE) │         │ claimed_speaker_id  │         │ auto_block_clones   │
└─────────────────────┘         └──────────┬──────────┘         │ status (ACTIVE/END) │         └─────────────────────┘
                                           │ 1:1                │ risk_score          │
                                           ▼                    │ risk_level          │
                                ┌─────────────────────┐         └──────────┬──────────┘
                                │ SpeakerProfileModel │                    │ 1:N
                                │─────────────────────│         ┌──────────┴──────────┐
                                │ id (PK)             │         ▼                     ▼
                                │ identity_id (FK)    │  ┌──────────────┐      ┌─────────────────────────┐
                                │ embedding_vector    │  │  RiskEvent   │      │    SecurityIncident     │
                                │ sample_count        │  │──────────────│      │─────────────────────────│
                                │ updated_at          │  │ id (PK)      │      │ id (PK)                 │
                                └─────────────────────┘  │ session_id   │      │ incident_id (UNIQUE)    │
                                                         │ chunk_id     │      │ org_id (FK)             │
                                                         │ synth_prob   │      │ session_id (FK)         │
                                                         │ speaker_sim  │      │ severity (CRITICAL)     │
                                                         │ intent       │      │ status (OPEN/CONFIRMED) │
                                                         └──────────────┘      └────────────┬────────────┘
                                                                                            │ 1:N
                                                                                            ▼
                                                                               ┌─────────────────────────┐
                                                                               │     SecurityAction      │
                                                                               │─────────────────────────│
                                                                               │ id (PK)                 │
                                                                               │ incident_id (FK)        │
                                                                               │ action_type (BLOCK/etc) │
                                                                               │ actor_id (FK)           │
                                                                               │ notes                   │
                                                                               └─────────────────────────┘
```

### Privacy & Biometric Safeguards
- **Zero Raw Audio Storage**: Neither PostgreSQL nor disk saves user voice calls. Audio chunks are processed in-memory and discarded.
- **Biometric Minimization**: Speaker identity is stored solely as a 192-dimensional floating-point embedding vector derived by ECAPA-TDNN. The original acoustic voiceprints cannot be reconstructed from the embedding.

---

## 7. AI Integration Adapter Layer

Located at [`backend/platform/services/ai_adapter.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/ai_adapter.py).

Member 1's `StreamingAudioPipeline` manages audio windowing, VAD gating, deepfake scoring, speaker verification, Whisper transcription, and Intent detection. The `AIAdapter` class encapsulates this pipeline as a thread-safe singleton.

### Responsibilities of the Adapter:
1. **Audio Normalization**: Accepts incoming raw PCM bytes, WAV byte buffers, or float32 arrays from the WebSocket and converts them to 16 kHz mono float32 without triggering Member 1's internal filesystem path validation assertions.
2. **Session Context Management**: Automatically manages session initialization with `pipeline.start_session(session_id, claimed_speaker_id)`.
3. **Telemetry Unification**: Translates Member 1's `StreamingChunkResult` into the platform's standardized `ProcessedChunkTelemetry` DTO containing:
   - `speech_detected`: Boolean from Silero VAD.
   - `raw_synthetic_prob` & `smoothed_synthetic_prob`: Deepfake CNN probabilities.
   - `raw_speaker_sim` & `smoothed_speaker_sim`: ECAPA-TDNN cosine similarities.
   - `identity_status`: `MATCHED`, `MISMATCHED`, or `UNENROLLED`.
   - `transcript` & `accumulated_transcript`: Faster-Whisper ASR results.
   - `intent` & `intent_confidence`: Social engineering flags.
   - `verdict`: `genuine`, `cloned`, `imposter`, or `inconclusive`.
   - `risk_decision`: Full Member 1 `RiskDecision` object.

---

## 8. Security Policy Engine & Risk Decision Matrix

Located at [`backend/platform/services/policy_engine.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/policy_engine.py).

Member 1's `RiskEngine` generates a mathematical score between 0.0 and 100.0. The `PolicyEngine` applies enterprise rules on top of this score.

### Decision Matrix & Escalation Logic

| Condition / Scenario | Base Risk Level | Intent Detected | Organization Escalation | Action Taken |
|---|---|---|---|---|
| Natural enrolled voice (Sim > 0.80, Synth < 0.15) | `SAFE` | Any | None | `ALLOW` |
| Low voice activity / Background noise | `SAFE` | None | None | `MONITOR` |
| Inconclusive acoustic match (borderline) | `MEDIUM` | `NORMAL_CONVERSATION` | Caution Flag | `VERIFY_SPEAKER` |
| Speaker Mismatch (Sim < 0.60, Synth < 0.20) | `HIGH` | `NORMAL_CONVERSATION` | Notify SOC | `WARN_USER` + `CREATE_INCIDENT` |
| Speaker Mismatch + Sensitive Request | `HIGH` | `OTP_REQUEST` / `PAYMENT` | Escalate to SOC | `REQUIRE_ADDITIONAL_VERIFICATION` |
| **Synthetic Voice + Enrolled VIP (CFO)** | **`CRITICAL`** | Any | **Immediate Priority Alert** | **`WARN_USER` + `NOTIFY_ORG` + `CREATE_INCIDENT`** |
| **Synthetic Voice + Sensitive Intent** | **`CRITICAL`** | **`OTP_REQUEST` / `WIRE`** | **Auto-Block (if enabled)** | **`BLOCK_CALL` + Emergency Alert** |

---

## 9. Real-Time Dual Alert Dispatch Engine

Located at [`backend/platform/services/alert_dispatcher.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/alert_dispatcher.py) and [`orchestrator.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/orchestrator.py).

When an ongoing call crosses into `HIGH` or `CRITICAL` risk:

```
                          Risk Evaluated >= HIGH
                                    │
                  ┌─────────────────┴─────────────────┐
                  ▼                                   ▼
        Session Alert Channel               Organization SOC Channel
         (/ws/stream/{session_id})             (/ws/org/{org_id}/alerts)
                  │                                   │
                  ▼                                   ▼
        [USER_SECURITY_ALERT]               [ORGANIZATION_SECURITY_ALERT]
   - Delivered to call recipient       - Broadcast to all logged-in SOC operators
   - Full-screen warning message       - Red flashing incident card in SOC dashboard
   - Immediate advisory action:        - Complete acoustic & biometric evidence:
     "Do NOT share OTP or transfer        • Synthetic prob: 99.9%
      funds. Caller voice is cloned."     • Speaker similarity: 0.91
                                          • Claimed identity: CFO (David Vance)
                                          • Intent: OTP_REQUEST
                                          • Suggested Action: BLOCK_CALL
```

### Multi-Tenant WebSocket Isolation
- **Organization Isolation**: Operator sockets authenticate with a JWT bearer token and subscribe to `/ws/org/{org_id}/alerts`. An operator in Org A will **never** receive alert packets belonging to Org B.
- **Session Isolation**: Call sockets `/ws/stream/{session_id}` only receive audio telemetry, warnings, and termination events destined for that specific session.

---

## 10. Incident Management & Deduplication Lifecycle

Located in [`backend/platform/services/orchestrator.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/orchestrator.py).

### Smart Deduplication
In real-time audio, a 30-second phone call consists of 30–60 consecutive chunks. Naive architectures create 30 separate incidents for the same call.
The `SecurityOrchestrator` implements **session-aware deduplication**:
- If an incident for `session_id` is already `OPEN` or `UNDER_REVIEW`, new incoming high-risk chunks **update** the existing incident's risk score, severity, acoustic evidence, and transcript in-place.
- Only a single authoritative incident is maintained per attack session.

### Incident Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> OPEN : High/Critical risk detected
    OPEN --> UNDER_REVIEW : Operator assigns/reviews incident
    UNDER_REVIEW --> CONFIRMED_ATTACK : Operator confirms voice clone
    UNDER_REVIEW --> FALSE_POSITIVE : Operator marks authentic voice
    CONFIRMED_ATTACK --> RESOLVED : Mitigation taken & call closed
    FALSE_POSITIVE --> RESOLVED : Case dismissed
    RESOLVED --> [*]
```

---

## 11. Security Operator Actions (Simulated Mitigation)

When investigating an incident in the SOC console, operators can trigger backend actions via `POST /api/incidents/{incident_id}/action`:

1. `CONFIRM_ATTACK`: Marks the incident as a confirmed impersonation attack; updates organizational threat telemetry.
2. `FALSE_POSITIVE`: Flags the detection as benign for AI auditing.
3. `ESCALATE`: Notifies senior security admins.
4. `REQUIRE_ADDITIONAL_VERIFICATION`: Flags the call session to demand out-of-band identity verification (e.g. physical callback).
5. `BLOCK_CALL`:
   - Immediately sets `CallSession.status = "TERMINATED_BY_SECURITY"`.
   - Sends a `CALL_ENDED` frame over the user's active WebSocket with `reason="BLOCKED_BY_SECURITY"`.
   - Pushes real-time `SECURITY_ACTION` and `INCIDENT_UPDATED` frames to all connected SOC consoles.
   - Records the termination in the immutable `AuditLog`.

---

## 12. Biometric Speaker Enrollment Integration

Located in [`backend/platform/services/speaker_service.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/services/speaker_service.py) and [`backend/platform/db/speaker_repo_adapter.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/speaker_repo_adapter.py).

Member 1 designed `SpeakerEnrollmentService` relying on an abstract `BaseSpeakerRepository`. Member 2 implemented `DatabaseSpeakerRepository`, storing biometric profiles directly in SQL without touching Member 1 files.

### Enrollment Flow:
1. Administrator calls `POST /api/protected-identities` (e.g. Name: "David Vance", Title: "Chief Financial Officer", Speaker ID: `LA_0069`).
2. Administrator uploads 1–5 reference audio samples via `POST /api/protected-identities/{id}/enroll`.
3. The platform passes audio samples to Member 1's `SpeakerEnrollmentService`.
4. Silero VAD validates that speech duration exceeds 0.5s per sample.
5. ECAPA-TDNN computes 192-dimensional embeddings for each sample and checks cross-sample consistency (> 0.50).
6. The normalized average embedding vector is persisted in the database linked to the `ProtectedIdentity`.

---

## 13. Complete REST API Reference

Interactive Swagger documentation is available at `http://localhost:8000/docs`.

### 1. Authentication
- `POST /api/auth/login`
  - **Body**: `{"username": "employee", "password": "employee123"}`
  - **Returns**: `{"access_token": "...", "token_type": "bearer", "user": {...}}`
- `GET /api/auth/me`
  - **Headers**: `Authorization: Bearer <token>`
  - **Returns**: Current user profile, organization ID, and role (`USER`, `SECURITY_OPERATOR`, `ADMIN`).

### 2. Protected Identities (VIP Voice Registry)
- `GET /api/protected-identities` (List VIP profiles and enrollment statuses)
- `POST /api/protected-identities` (Create a new protected identity)
  - **Body**: `{"full_name": "David Vance", "title": "CFO", "speaker_id": "LA_0069"}`
- `GET /api/protected-identities/{id}` (Get identity profile)
- `POST /api/protected-identities/{id}/enroll` (Enroll reference WAV files)
  - **Form-Data**: `files` (Multipart audio file list)
- `DELETE /api/protected-identities/{id}` (Deactivate identity)

### 3. Call Session Management
- `POST /api/calls/start`
  - **Body**: `{"caller_name": "CFO Office", "claimed_speaker_id": "LA_0069"}`
  - **Returns**: `{"session_id": "call_abc123", "status": "ACTIVE", ...}`
- `GET /api/calls` (List calls; filtered by user or organization)
- `GET /api/calls/{session_id}` (Call telemetry, final verdict, risk score)
- `POST /api/calls/{session_id}/end` (Terminate call session and compute session summary)

### 4. Security Incidents
- `GET /api/incidents?severity=CRITICAL&status=OPEN` (Filter incidents)
- `GET /api/incidents/{incident_id}` (Retrieve incident details and timeline)
- `POST /api/incidents/{incident_id}/action`
  - **Body**: `{"action_type": "BLOCK_CALL", "notes": "Confirmed AI voice clone of CFO."}`
- `PATCH /api/incidents/{incident_id}`
  - **Body**: `{"status": "UNDER_REVIEW"}`

### 5. Policy & Governance
- `GET /api/policies` (Get current organization thresholds)
- `PUT /api/policies` (Update risk thresholds and auto-block rules)
- `GET /api/audit-logs` (Query historical security events)
- `GET /api/stats` (Active calls, attack count, false-positive rate)
- `GET /api/health` (Service health probe, model load status)

---

## 14. WebSocket API & Real-Time Event Contracts

All WebSocket payloads are structured with a common header:
```json
{
  "event": "<EVENT_TYPE>",
  "timestamp": "2026-09-05T12:00:00Z",
  "data": { ... }
}
```

### Event Specifications

#### 1. `RISK_UPDATE` (Emitted per audio chunk to `/ws/stream/{session_id}`)
```json
{
  "event": "RISK_UPDATE",
  "timestamp": "2026-09-05T12:00:01.120Z",
  "data": {
    "session_id": "call_6a9b1c",
    "chunk_id": 1,
    "speech_detected": true,
    "risk_score": 98.5,
    "risk_level": "CRITICAL",
    "synthetic_probability": 0.9995,
    "speaker_similarity": 0.9120,
    "speaker_match": true,
    "identity_status": "MATCHED",
    "verdict": "cloned",
    "transcript": "Please authorize the wire transfer immediately.",
    "intent": "PAYMENT_TRANSFER",
    "reasons": [
      "CRITICAL: High speaker match combined with high synthetic probability indicates AI clone of enrolled speaker.",
      "Sensitive conversational intent detected: PAYMENT_TRANSFER"
    ],
    "recommended_action": "BLOCK_OR_ESCALATE",
    "is_alert": true,
    "latency_ms": 482.0
  }
}
```

#### 2. `USER_SECURITY_ALERT` (Emergency banner to `/ws/stream/{session_id}`)
```json
{
  "event": "USER_SECURITY_ALERT",
  "timestamp": "2026-09-05T12:00:01.125Z",
  "data": {
    "session_id": "call_6a9b1c",
    "severity": "CRITICAL",
    "risk_score": 98.5,
    "warning_message": "CRITICAL SECURITY ALERT: High-probability AI voice cloning detected! Do not disclose OTPs or execute payments.",
    "claimed_identity": "David Vance (CFO)",
    "reasons": ["AI clone of enrolled speaker", "Sensitive payment transfer request"],
    "recommended_action": "BLOCK_OR_ESCALATE"
  }
}
```

#### 3. `ORGANIZATION_SECURITY_ALERT` (To `/ws/org/{org_id}/alerts`)
```json
{
  "event": "ORGANIZATION_SECURITY_ALERT",
  "timestamp": "2026-09-05T12:00:01.128Z",
  "data": {
    "incident_id": "inc_7f8e9d",
    "org_id": "org_demo_001",
    "session_id": "call_6a9b1c",
    "severity": "CRITICAL",
    "scenario": "AI_CLONE_ENROLLED_SPEAKER",
    "risk_score": 98.5,
    "claimed_identity": "LA_0069",
    "synthetic_probability": 0.9995,
    "speaker_similarity": 0.9120,
    "intent": "PAYMENT_TRANSFER",
    "recommended_action": "BLOCK_CALL"
  }
}
```

#### 4. `SECURITY_ACTION` (To `/ws/org/{org_id}/alerts`)
```json
{
  "event": "SECURITY_ACTION",
  "timestamp": "2026-09-05T12:01:15.000Z",
  "data": {
    "incident_id": "inc_7f8e9d",
    "session_id": "call_6a9b1c",
    "action_type": "BLOCK_CALL",
    "actor_username": "operator",
    "notes": "Confirmed synthetic voice clone attempting CFO impersonation."
  }
}
```

---

## 15. Authentication, RBAC & Multi-Tenant Isolation

### Roles and Permissions

| Action / Resource | `USER` (Employee) | `SECURITY_OPERATOR` (SOC) | `ADMIN` |
|---|:---:|:---:|:---:|
| Initiate & stream own phone call | Yes | Yes | Yes |
| Receive personal `USER_SECURITY_ALERT` | Yes | Yes | Yes |
| View Organization SOC dashboard & incidents | No | Yes | Yes |
| Receive `ORGANIZATION_SECURITY_ALERT` feed | No | Yes | Yes |
| Execute mitigation actions (`BLOCK_CALL`, etc.) | No | Yes | Yes |
| Register VIPs & enroll biometric speaker samples | No | Yes | Yes |
| Edit organization security policy thresholds | No | No | Yes |
| Manage tenant users | No | No | Yes |

### Password Security & Token Verification
- Password hashing uses standard **PBKDF2-HMAC-SHA256** with 100,000 rounds and unique salt generation.
- Bearer tokens are signed using **HS256 JWT** containing user identity, role, and organization ID.
- Every organization-scoped query strictly filters by `org_id` to enforce multi-tenant isolation.

---

## 16. Installation & Configuration Guide

### 1. Prerequisites
- Python 3.11 or higher
- System audio dependencies (`libsndfile`, `ffmpeg` optional)

### 2. Environment Setup
```bash
# Clone the repository
git clone https://github.com/Sivasankari1708/VoiceCloneDetection-SIH.git
cd VoiceCloneDetection-SIH

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate

# Install required dependencies
pip install -r requirements.txt
pip install fastapi uvicorn websockets sqlalchemy asyncpg psycopg2-binary pyjwt cryptography python-multipart pytest
```

### 3. Environment Variables (`.env`)
The platform works out-of-the-box with default settings, but can be configured via environment variables:

```ini
# Database (PostgreSQL URL; falls back automatically to SQLite if unavailable)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/voice_clone_db
DATABASE_SYNC_URL=sqlite:///./voice_clone_detection.db

# Security & Authentication
JWT_SECRET=super-secret-sih-hackathon-key-change-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=1440

# Risk Threshold Defaults
DEFAULT_HIGH_RISK_THRESHOLD=70.0
DEFAULT_CRITICAL_RISK_THRESHOLD=85.0
DEFAULT_SYNTHETIC_THRESHOLD=0.50
DEFAULT_SPEAKER_SIMILARITY_THRESHOLD=0.70
```

---

## 17. Running the Platform

### 1. Launch the FastAPI Platform Server
```bash
source .venv/bin/activate
uvicorn backend.platform.server.app:app --host 0.0.0.0 --port 8000 --reload
```
Upon startup, the server automatically initializes tables, runs database migrations, and seeds default accounts and the CFO identity.

### 2. Default Seeded Credentials
- **Administrator**: `username="admin"`, `password="admin123"` (Role: `ADMIN`)
- **SOC Operator**: `username="operator"`, `password="operator123"` (Role: `SECURITY_OPERATOR`)
- **Employee**: `username="employee"`, `password="employee123"` (Role: `USER`)
- **Protected VIP Identity**: David Vance (CFO, Speaker ID `LA_0069`)

---

## 18. Automated Test Suite & Verification Results

The platform includes a test suite covering database isolation, RBAC, REST endpoints, WebSocket streaming, and end-to-end real audio scenarios.

### Run All Platform Tests
```bash
./.venv/bin/pytest backend/platform/tests/ -v
```

### Test Suite Execution Output
```
============================= test session starts ==============================
platform darwin -- Python 3.11.16, pytest-9.1.1, pluggy-1.6.0
rootdir: /Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH
plugins: anyio-4.15.0
collected 20 items

backend/platform/tests/test_api.py::test_health_endpoint PASSED          [  5%]
backend/platform/tests/test_api.py::test_auth_login_and_me PASSED        [ 10%]
backend/platform/tests/test_api.py::test_protected_identities_endpoints PASSED [ 15%]
backend/platform/tests/test_api.py::test_calls_lifecycle_api PASSED      [ 20%]
backend/platform/tests/test_api.py::test_policies_and_stats_endpoints PASSED [ 25%]
backend/platform/tests/test_auth.py::test_password_hashing PASSED        [ 30%]
backend/platform/tests/test_auth.py::test_jwt_token_creation_and_decoding PASSED [ 35%]
backend/platform/tests/test_auth.py::test_role_based_access_control PASSED [ 40%]
backend/platform/tests/test_db.py::test_organization_and_user_creation PASSED [ 45%]
backend/platform/tests/test_db.py::test_call_session_and_risk_event PASSED [ 50%]
backend/platform/tests/test_db.py::test_database_speaker_repository_contract PASSED [ 55%]
backend/platform/tests/test_e2e_scenarios.py::test_scenario_1_genuine_enrolled_speaker PASSED [ 60%]
backend/platform/tests/test_e2e_scenarios.py::test_scenario_2_ai_cloned_cfo_attack_and_operator_mitigation PASSED [ 65%]
backend/platform/tests/test_e2e_scenarios.py::test_scenario_3_imposter_speaker PASSED [ 70%]
backend/platform/tests/test_orchestrator.py::test_start_and_end_call_lifecycle PASSED [ 75%]
backend/platform/tests/test_orchestrator.py::test_policy_engine_cfo_impersonation_escalation PASSED [ 80%]
backend/platform/tests/test_orchestrator.py::test_incident_creation_and_deduplication PASSED [ 85%]
backend/platform/tests/test_orchestrator.py::test_operator_action_execution PASSED [ 90%]
backend/platform/tests/test_websocket.py::test_websocket_stream_chunk_and_risk_update PASSED [ 95%]
backend/platform/tests/test_websocket.py::test_websocket_dual_alert_on_critical_voice_clone PASSED [100%]

======================== 20 passed in 5.66s ========================
```

---

## 19. Handover & Integration Guide for Members 3 & 4

Members 3 and 4 own the frontend user dashboard and organization SOC console. Use the following specifications to connect to Member 2:

### 1. User Calling Interface (Member 3)
1. **Start Call**:
   ```http
   POST /api/calls/start
   Authorization: Bearer <user_jwt>
   Content-Type: application/json

   { "claimed_speaker_id": "LA_0069", "caller_name": "David Vance" }
   ```
   Save the returned `session_id`.
2. **Open Streaming WebSocket**:
   ```javascript
   const ws = new WebSocket(`ws://localhost:8000/ws/stream/${session_id}`);
   ```
3. **Stream Microphone Audio**:
   Send raw 16 kHz, 16-bit mono PCM chunks or WAV slices every 1.0 second:
   ```javascript
   ws.send(audioBuffer);
   ```
4. **Render Events**:
   - On `event === "RISK_UPDATE"`: Update live risk score gauge, speech transcript, and telemetry chips.
   - On `event === "USER_SECURITY_ALERT"`: Display immediate red warning modal.
   - On `event === "CALL_ENDED"`: Show call summary modal or display "Call terminated by Security".

### 2. Organization SOC Console (Member 4)
1. **Authenticate**: Log in via `POST /api/auth/login` using operator credentials.
2. **Connect to Alert Feed**:
   ```javascript
   const orgId = user.org_id;
   const socWs = new WebSocket(`ws://localhost:8000/ws/org/${orgId}/alerts?token=${jwt}`);
   ```
3. **Listen for Live Threat Events**:
   - `ORGANIZATION_SECURITY_ALERT`: Add high-priority card to active alert banner.
   - `INCIDENT_CREATED`: Add incident to the triage queue.
   - `INCIDENT_UPDATED`: Update incident status chip in real time.
4. **Trigger Operator Mitigations**:
   ```http
   POST /api/incidents/{incident_id}/action
   Authorization: Bearer <operator_jwt>
   Content-Type: application/json

   {
     "action_type": "BLOCK_CALL",
     "notes": "Verified voice clone attempting CFO impersonation."
   }
   ```

---

## 20. Scope, Boundaries & Operational Limitations

1. **Audio Ingestion**: Audio streaming is designed for browser microphone capture over WebSocket (16 kHz mono PCM / WAV / WebM). Cellular/SS7 telephony interception is out of prototype scope.
2. **Mitigation Actions**: Security actions (`BLOCK_CALL`, `REQUIRE_ADDITIONAL_VERIFICATION`, `CONFIRM_ATTACK`) are simulated application states reflected across WebSocket events and database statuses; they do not disconnect physical carrier lines or trigger real banking transactions.
3. **Database Fallback**: Defaults to PostgreSQL (`postgresql+asyncpg://...`), and automatically falls back to SQLite (`voice_clone_detection.db`) for lightweight local testing when a PostgreSQL instance is not running.
4. **Member 1 Immutability**: No changes were made to Member 1 AI code. All platform capabilities operate via clean wrappers and external orchestration.
