# Database Models: SQLAlchemy Entities

## 1. File Location & Purpose
- **Source File**: `backend/platform/db/models.py`
- **Purpose**: Defines declarative SQLAlchemy ORM classes, enum constants, column constraints, serialization helpers (`to_dict()`), and relationship definitions.

---

## 2. Enums Defined

```python
class UserRole(str, Enum):
    USER = "USER"
    SECURITY_OPERATOR = "SECURITY_OPERATOR"
    ADMIN = "ADMIN"

class IncidentStatus(str, Enum):
    OPEN = "OPEN"
    UNDER_REVIEW = "UNDER_REVIEW"
    CONFIRMED_ATTACK = "CONFIRMED_ATTACK"
    FALSE_POSITIVE = "FALSE_POSITIVE"
    RESOLVED = "RESOLVED"

class SecurityActionType(str, Enum):
    ALLOW = "ALLOW"
    WARN_USER = "WARN_USER"
    VERIFY_SPEAKER = "VERIFY_SPEAKER"
    REQUIRE_ADDITIONAL_VERIFICATION = "REQUIRE_ADDITIONAL_VERIFICATION"
    ESCALATE = "ESCALATE"
    BLOCK_CALL = "BLOCK_CALL"
    CONFIRM_ATTACK = "CONFIRM_ATTACK"
    FALSE_POSITIVE = "FALSE_POSITIVE"
    RESOLVE = "RESOLVE"
    DISMISS = "DISMISS"
```

---

## 3. Entity Models

### 3.1 `Organization`
- **Table**: `organizations`
- **Attributes**: `id`, `name`, `code`, `is_active`, `created_at`, `updated_at`.
- **Relationships**:
  - `users`: `1:N` to `User`.
  - `protected_identities`: `1:N` to `ProtectedIdentity`.
  - `call_sessions`: `1:N` to `CallSession`.
  - `incidents`: `1:N` to `SecurityIncident`.
  - `policy`: `1:1` to `SecurityPolicy`.
  - `audit_logs`: `1:N` to `AuditLog`.

### 3.2 `User`
- **Table**: `users`
- **Attributes**: `id`, `org_id`, `username`, `email`, `hashed_password`, `full_name`, `role`, `is_active`, `created_at`, `updated_at`.
- **Methods**: `to_dict()` (omits `hashed_password`).

### 3.3 `ProtectedIdentity`
- **Table**: `protected_identities`
- **Attributes**: `id`, `org_id`, `full_name`, `title`, `department`, `risk_priority`, `speaker_id`, `is_active`, `created_at`, `updated_at`.
- **Relationships**:
  - `speaker_profile`: `1:1` to `SpeakerProfileModel` (`cascade="all, delete-orphan"`).

### 3.4 `SpeakerProfileModel`
- **Table**: `speaker_profiles`
- **Attributes**: `id`, `identity_id`, `embedding_vector` (`LargeBinary`), `embedding_dim`, `sample_count`, `consistency_score`, `metadata_json`, `created_at`, `updated_at`.

### 3.5 `CallSession`
- **Table**: `call_sessions`
- **Attributes**: `id`, `session_id`, `org_id`, `user_id`, `caller_number`, `caller_name`, `claimed_speaker_id`, `claimed_identity_id`, `status`, `current_risk_score`, `current_risk_level`, `accumulated_transcript`, `total_chunks`, `total_audio_seconds`, `total_speech_seconds`, `start_time`, `end_time`.
- **Relationships**:
  - `risk_events`: `1:N` to `RiskEvent` (`cascade="all, delete-orphan"`).
  - `incident`: `1:1` to `SecurityIncident`.

### 3.6 `RiskEvent`
- **Table**: `risk_events`
- **Attributes**: `id`, `session_id`, `chunk_id`, `timestamp`, `speech_detected`, `raw_synthetic_prob`, `smoothed_synthetic_prob`, `raw_speaker_sim`, `smoothed_speaker_sim`, `identity_status`, `verdict`, `risk_score`, `risk_level`, `intent`, `is_alert`.

### 3.7 `SecurityIncident`
- **Table**: `security_incidents`
- **Attributes**: `id`, `incident_id`, `org_id`, `session_id`, `severity`, `status`, `scenario`, `claimed_identity`, `current_risk_score`, `synthetic_probability`, `speaker_similarity`, `intent`, `reasons_json`, `recommended_action`, `operator_id`, `operator_notes`, `created_at`, `updated_at`, `resolved_at`.
- **Relationships**:
  - `actions`: `1:N` to `SecurityAction`.

### 3.8 `SecurityAction`
- **Table**: `security_actions`
- **Attributes**: `id`, `incident_id`, `session_id`, `action_type`, `status`, `actor_id`, `actor_role`, `notes`, `created_at`.

### 3.9 `SecurityPolicy`
- **Table**: `security_policies`
- **Attributes**: `id`, `org_id`, `risk_score_high_threshold`, `risk_score_critical_threshold`, `synthetic_prob_threshold`, `speaker_similarity_threshold`, `auto_block_critical_clones`, `require_additional_verification_on_mismatch`, `updated_at`.

### 3.10 `AuditLog`
- **Table**: `audit_logs`
- **Attributes**: `id`, `org_id`, `actor_id`, `session_id`, `incident_id`, `event_type`, `details_json`, `created_at`.

---

## 4. Source Files Covered
- `backend/platform/db/models.py`
