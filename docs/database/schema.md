# Database Schema Reference

## 1. Complete Relational Schema (DDL Equivalent)

The platform schema is declared via SQLAlchemy ORM in `backend/platform/db/models.py`.

```sql
-- 1. Organizations (Tenants)
CREATE TABLE organizations (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    code VARCHAR(32) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- 2. Users (Tenants' users & operators)
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    org_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    username VARCHAR(64) NOT NULL UNIQUE,
    email VARCHAR(128) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(128),
    role VARCHAR(32) NOT NULL DEFAULT 'USER',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- 3. Protected Identities (VIP Voice Registry)
CREATE TABLE protected_identities (
    id VARCHAR(36) PRIMARY KEY,
    org_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    full_name VARCHAR(128) NOT NULL,
    title VARCHAR(64) NOT NULL,
    department VARCHAR(64),
    risk_priority VARCHAR(16) DEFAULT 'CRITICAL',
    speaker_id VARCHAR(64) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- 4. Speaker Profiles (Biometric Embeddings)
CREATE TABLE speaker_profiles (
    id VARCHAR(36) PRIMARY KEY,
    identity_id VARCHAR(36) NOT NULL UNIQUE REFERENCES protected_identities(id),
    embedding_vector BLOB NOT NULL,  -- Stored as binary pickle / float32 bytes
    embedding_dim INTEGER DEFAULT 192,
    sample_count INTEGER DEFAULT 1,
    consistency_score FLOAT DEFAULT 1.0,
    metadata_json TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);

-- 5. Call Sessions
CREATE TABLE call_sessions (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL UNIQUE,
    org_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    user_id VARCHAR(36) REFERENCES users(id),
    caller_number VARCHAR(32),
    caller_name VARCHAR(128),
    claimed_speaker_id VARCHAR(64),
    claimed_identity_id VARCHAR(36) REFERENCES protected_identities(id),
    status VARCHAR(32) DEFAULT 'ACTIVE',
    current_risk_score FLOAT DEFAULT 0.0,
    current_risk_level VARCHAR(16) DEFAULT 'SAFE',
    accumulated_transcript TEXT DEFAULT '',
    total_chunks INTEGER DEFAULT 0,
    total_audio_seconds FLOAT DEFAULT 0.0,
    total_speech_seconds FLOAT DEFAULT 0.0,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP
);

-- 6. Risk Events (Chunk Telemetry)
CREATE TABLE risk_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,  -- SERIAL in Postgres
    session_id VARCHAR(64) NOT NULL REFERENCES call_sessions(session_id),
    chunk_id INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    speech_detected BOOLEAN DEFAULT TRUE,
    raw_synthetic_prob FLOAT NOT NULL,
    smoothed_synthetic_prob FLOAT NOT NULL,
    raw_speaker_sim FLOAT,
    smoothed_speaker_sim FLOAT,
    identity_status VARCHAR(32),
    verdict VARCHAR(32),
    risk_score FLOAT NOT NULL,
    risk_level VARCHAR(16) NOT NULL,
    intent VARCHAR(64),
    is_alert BOOLEAN DEFAULT FALSE
);

-- 7. Security Incidents
CREATE TABLE security_incidents (
    id VARCHAR(36) PRIMARY KEY,
    incident_id VARCHAR(64) NOT NULL UNIQUE,
    org_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    session_id VARCHAR(64) NOT NULL REFERENCES call_sessions(session_id),
    severity VARCHAR(16) NOT NULL,
    status VARCHAR(32) DEFAULT 'OPEN',
    scenario VARCHAR(64),
    claimed_identity VARCHAR(128),
    current_risk_score FLOAT NOT NULL,
    synthetic_probability FLOAT,
    speaker_similarity FLOAT,
    intent VARCHAR(64),
    reasons_json TEXT,
    recommended_action VARCHAR(64),
    operator_id VARCHAR(36) REFERENCES users(id),
    operator_notes TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP
);

-- 8. Security Actions (Mitigations)
CREATE TABLE security_actions (
    id VARCHAR(36) PRIMARY KEY,
    incident_id VARCHAR(64) NOT NULL REFERENCES security_incidents(incident_id),
    session_id VARCHAR(64) NOT NULL REFERENCES call_sessions(session_id),
    action_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) DEFAULT 'COMPLETED',
    actor_id VARCHAR(36) REFERENCES users(id),
    actor_role VARCHAR(32),
    notes TEXT,
    created_at TIMESTAMP NOT NULL
);

-- 9. Security Policies
CREATE TABLE security_policies (
    id VARCHAR(36) PRIMARY KEY,
    org_id VARCHAR(36) NOT NULL UNIQUE REFERENCES organizations(id),
    risk_score_high_threshold FLOAT DEFAULT 70.0,
    risk_score_critical_threshold FLOAT DEFAULT 85.0,
    synthetic_prob_threshold FLOAT DEFAULT 0.50,
    speaker_similarity_threshold FLOAT DEFAULT 0.70,
    auto_block_critical_clones BOOLEAN DEFAULT FALSE,
    require_additional_verification_on_mismatch BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP NOT NULL
);

-- 10. Audit Logs
CREATE TABLE audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    org_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    actor_id VARCHAR(36) REFERENCES users(id),
    session_id VARCHAR(64),
    incident_id VARCHAR(64),
    event_type VARCHAR(64) NOT NULL,
    details_json TEXT,
    created_at TIMESTAMP NOT NULL
);
```

---

## 2. Source Files Covered
- `backend/platform/db/models.py`
- `backend/platform/db/session.py`
