# Module: Database Models Specification

**File**: [`backend/platform/db/models.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/models.py)  
**Package**: `backend.platform.db`

---

## 1. Module Purpose & Core Guarantees

`models.py` defines the declarative SQLAlchemy ORM schema for the Member 2 Platform layer.

### Critical Biometric Security & Privacy Guarantee
- **Raw audio is NEVER persisted**: Audio waveforms, frames, and recordings are strictly kept in transient memory buffers during streaming and wiped immediately.
- **Biometric representations**: Speaker voice profiles are stored exclusively as 192-dimensional numerical vectors serialized to JSON strings in `speaker_profiles`.

---

## 2. Model Inventory & Definitions

### 2.1 `Organization` (`organizations`)
- **Purpose**: Tenant boundary guaranteeing multi-tenant data isolation.
- **Columns**:
  - `id`: `String(64)`, Primary Key (UUID4)
  - `name`: `String(255)`, Not Null
  - `code`: `String(64)`, Unique, Indexed, Not Null
  - `is_active`: `Boolean`, Default `True`, Not Null
  - `created_at`: `DateTime(timezone=True)`, Default `utcnow`
  - `updated_at`: `DateTime(timezone=True)`, OnUpdate `utcnow`
- **Relationships**: `users`, `protected_identities`, `call_sessions`, `incidents`, `audit_logs`, `policies` (all `cascade="all, delete-orphan"`).

### 2.2 `User` (`users`)
- **Purpose**: Platform accounts supporting roles `USER`, `SECURITY_OPERATOR`, and `ADMIN`.
- **Columns**:
  - `id`: `String(64)`, Primary Key
  - `org_id`: `String(64)`, Foreign Key (`organizations.id`, `CASCADE`), Indexed
  - `username`: `String(100)`, Unique, Indexed
  - `email`: `String(255)`, Unique, Indexed
  - `hashed_password`: `String(255)` (PBKDF2 format: `salt$hash`)
  - `full_name`: `String(255)`
  - `role`: `String(32)`, Default `"USER"`, Indexed
  - `is_active`: `Boolean`, Default `True`
  - `created_at` / `updated_at`: `DateTime(timezone=True)`
- **Relationships**: `organization`, `call_sessions`.

### 2.3 `ProtectedIdentity` (`protected_identities`)
- **Purpose**: Executive VIPs requiring active voice clone defense (e.g., CFO).
- **Columns**:
  - `id`: `String(64)`, Primary Key
  - `org_id`: `String(64)`, Foreign Key (`organizations.id`, `CASCADE`), Indexed
  - `full_name`: `String(255)`
  - `title`: `String(255)`
  - `department`: `String(255)`, Nullable
  - `email`: `String(255)`, Nullable
  - `phone`: `String(64)`, Nullable
  - `risk_priority`: `String(32)`, Default `"HIGH"` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`)
  - `speaker_id`: `String(128)`, Unique, Indexed (Key into biometric vector store)
  - `is_active`: `Boolean`, Default `True`
  - `created_at` / `updated_at`: `DateTime(timezone=True)`
- **Relationships**: `organization`, `speaker_profile` (1-to-1).

### 2.4 `SpeakerProfileModel` (`speaker_profiles`)
- **Purpose**: Stores enrolled reference biometric voice vector.
- **Columns**:
  - `id`: `String(64)`, Primary Key
  - `protected_identity_id`: `String(64)`, Foreign Key (`protected_identities.id`, `CASCADE`), Nullable
  - `speaker_id`: `String(128)`, Unique, Indexed
  - `embedding_dim`: `Integer`, Default `192`
  - `sample_count`: `Integer`, Default `1`
  - `embedding_vector_json`: `Text`, Not Null (Serialized list of floats)
  - `metadata_json`: `Text`, Default `"{}"`
  - `created_at` / `updated_at`: `DateTime(timezone=True)`
- **Method `to_safe_dict()`**: Redacts raw embedding vector from output JSON.

### 2.5 `CallSession` (`call_sessions`)
- **Purpose**: Live or historical call sessions monitored by the platform.
- **Columns**:
  - `session_id`: `String(128)`, Primary Key
  - `org_id`: `String(64)`, Foreign Key (`organizations.id`, `CASCADE`), Indexed
  - `user_id`: `String(64)`, Foreign Key (`users.id`, `SET NULL`), Nullable
  - `caller_number`: `String(64)`, Nullable
  - `caller_name`: `String(255)`, Nullable
  - `claimed_identity_id`: `String(64)`, Foreign Key (`protected_identities.id`, `SET NULL`), Nullable
  - `claimed_speaker_id`: `String(128)`, Nullable
  - `status`: `String(32)`, Default `"ACTIVE"`, Indexed (`ACTIVE`, `ENDED`, `TERMINATED_BY_SECURITY`, `BLOCKED`)
  - `start_time`: `DateTime(timezone=True)`
  - `end_time`: `DateTime(timezone=True)`, Nullable
  - `total_chunks`: `Integer`, Default `0`
  - `total_speech_seconds`: `Float`, Default `0.0`
  - `current_risk_score`: `Float`, Default `0.0`
  - `current_risk_level`: `String(32)`, Default `"SAFE"`
  - `final_verdict`: `String(32)`, Default `"inconclusive"`
  - `alert_triggered`: `Boolean`, Default `False`
  - `alert_reason`: `Text`, Nullable
  - `accumulated_transcript`: `Text`, Default `""`
- **Relationships**: `risk_events`, `incidents`, `actions`.

### 2.6 `RiskEvent` (`risk_events`)
- **Purpose**: Fine-grained per-chunk acoustic, phonetic, and risk telemetry.
- **Columns**:
  - `id`: `String(64)`, Primary Key
  - `session_id`: `String(128)`, Foreign Key (`call_sessions.session_id`, `CASCADE`), Indexed
  - `chunk_id`: `Integer`, Not Null
  - `timestamp`: `DateTime(timezone=True)`
  - `speech_detected`: `Boolean`, Default `False`
  - `raw_synthetic_prob` / `smoothed_synthetic_prob`: `Float`, Nullable
  - `raw_speaker_sim` / `smoothed_speaker_sim`: `Float`, Nullable
  - `speaker_match`: `Boolean`, Nullable
  - `transcript_chunk`: `Text`, Default `""`
  - `intent`: `String(64)`, Default `"NORMAL_CONVERSATION"`
  - `intent_confidence`: `Float`, Default `0.0`
  - `verdict`: `String(32)`, Default `"inconclusive"`
  - `risk_score`: `Float`, Default `0.0`
  - `risk_level`: `String(32)`, Default `"SAFE"`
  - `recommended_action`: `String(64)`, Default `"ALLOW"`
  - `is_alert`: `Boolean`, Default `False`
  - `alert_reason`: `Text`, Nullable
  - `latency_ms`: `Float`, Default `0.0`
  - `stage_timings_json`: `Text`, Default `"{}"`
- **Index**: `Index("idx_session_chunk", "session_id", "chunk_id")`.

### 2.7 `SecurityIncident` (`security_incidents`)
- **Purpose**: Security incident queue record created upon `HIGH` or `CRITICAL` risk.
- **Columns**:
  - `incident_id`: `String(64)`, Primary Key
  - `org_id`: `String(64)`, Foreign Key (`organizations.id`, `CASCADE`), Indexed
  - `session_id`: `String(128)`, Foreign Key (`call_sessions.session_id`, `CASCADE`), Indexed
  - `severity`: `String(32)`, Default `"HIGH"`, Indexed (`HIGH`, `CRITICAL`)
  - `scenario`: `String(64)`, Not Null
  - `claimed_identity`: `String(255)`, Nullable
  - `current_risk_score`: `Float`
  - `synthetic_probability`: `Float`, Nullable
  - `speaker_similarity`: `Float`, Nullable
  - `identity_status`: `String(64)`, Nullable
  - `intent`: `String(64)`, Nullable
  - `context_signals_json`: `Text`, Default `"[]"`
  - `reasons_json`: `Text`, Default `"[]"`
  - `recommended_action`: `String(64)`
  - `status`: `String(32)`, Default `"OPEN"`, Indexed (`OPEN`, `UNDER_REVIEW`, `CONFIRMED_ATTACK`, `FALSE_POSITIVE`, `RESOLVED`)
  - `operator_id`: `String(64)`, Foreign Key (`users.id`, `SET NULL`), Nullable
  - `operator_notes`: `Text`, Nullable
  - `created_at` / `updated_at` / `resolved_at`: `DateTime(timezone=True)`
- **Relationships**: `actions`.

### 2.8 `SecurityAction` (`security_actions`)
- **Purpose**: Mitigation record executed by an operator or policy automation.
- **Columns**:
  - `action_id`: `String(64)`, Primary Key
  - `incident_id`: `String(64)`, Foreign Key (`security_incidents.incident_id`, `CASCADE`), Nullable, Indexed
  - `session_id`: `String(128)`, Foreign Key (`call_sessions.session_id`, `CASCADE`), Indexed
  - `action_type`: `String(64)`, Not Null (`CONFIRM_ATTACK`, `FALSE_POSITIVE`, `ESCALATE`, `RESOLVE`, `BLOCK_CALL`, `REQUIRE_ADDITIONAL_VERIFICATION`, `DISMISS`)
  - `actor_id`: `String(64)`, Foreign Key (`users.id`, `SET NULL`), Nullable
  - `status`: `String(32)`, Default `"COMPLETED"`
  - `notes`: `Text`, Nullable
  - `timestamp`: `DateTime(timezone=True)`

### 2.9 `AuditLog` (`audit_logs`)
- **Purpose**: Immutable compliance and forensic trail.
- **Columns**:
  - `id`: `String(64)`, Primary Key
  - `org_id`: `String(64)`, Foreign Key (`organizations.id`, `CASCADE`), Indexed
  - `actor_id`: `String(64)`, Nullable
  - `session_id`: `String(128)`, Nullable, Indexed
  - `event_type`: `String(64)`, Not Null, Indexed (`CALL_STARTED`, `INCIDENT_CREATED`, `SECURITY_ACTION_TAKEN`, `CALL_ENDED`, etc.)
  - `ip_address`: `String(64)`, Nullable
  - `details_json`: `Text`, Default `"{}"`
  - `timestamp`: `DateTime(timezone=True)`, Indexed

### 2.10 `SecurityPolicy` (`security_policies`)
- **Purpose**: Configurable policy thresholds per organization.
- **Columns**:
  - `id`: `String(64)`, Primary Key
  - `org_id`: `String(64)`, Foreign Key (`organizations.id`, `CASCADE`), Unique, Indexed
  - `policy_config_json`: `Text`, Not Null
  - `created_at` / `updated_at`: `DateTime(timezone=True)`

---

## 3. Source Files Covered

- [`backend/platform/db/models.py`](file:///Users/dhurgadevi/Documents/GitHub/VoiceCloneDetection-SIH/backend/platform/db/models.py)
