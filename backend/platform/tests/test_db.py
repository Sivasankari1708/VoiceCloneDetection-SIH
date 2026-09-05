"""
backend/platform/tests/test_db.py
=================================
Tests for database persistence and DatabaseSpeakerRepository adapter.
"""

import numpy as np
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.speaker_repository import SpeakerProfile
from backend.platform.db.models import (
    CallSession,
    Organization,
    ProtectedIdentity,
    RiskEvent,
    SecurityAction,
    SecurityIncident,
    SpeakerProfileModel,
    User,
)
from backend.platform.db.session import Base
from backend.platform.db.speaker_repo_adapter import DatabaseSpeakerRepository


@pytest.fixture
def test_db():
    """Create an isolated in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db, TestingSessionLocal
    finally:
        db.close()


def test_organization_and_user_creation(test_db):
    db, _ = test_db
    org = Organization(name="Cyber Defense Corp", code="CDC_01")
    db.add(org)
    db.commit()

    assert org.id is not None
    assert org.code == "CDC_01"

    user = User(
        org_id=org.id,
        username="sec_lead",
        email="lead@cdc.com",
        hashed_password="hash",
        full_name="Lead Analyst",
        role="SECURITY_OPERATOR",
    )
    db.add(user)
    db.commit()

    assert user.id is not None
    assert user.organization.name == "Cyber Defense Corp"
    assert len(org.users) == 1


def test_call_session_and_risk_event(test_db):
    db, _ = test_db
    org = Organization(name="Org A", code="ORG_A")
    db.add(org)
    db.commit()

    call = CallSession(
        session_id="call_test_123",
        org_id=org.id,
        status="ACTIVE",
        current_risk_score=75.0,
        current_risk_level="HIGH",
    )
    db.add(call)
    db.commit()

    risk_event = RiskEvent(
        session_id="call_test_123",
        chunk_id=1,
        speech_detected=True,
        raw_synthetic_prob=0.88,
        smoothed_synthetic_prob=0.88,
        risk_score=90.0,
        risk_level="CRITICAL",
        verdict="cloned",
        is_alert=True,
    )
    db.add(risk_event)
    db.commit()

    assert len(call.risk_events) == 1
    assert call.risk_events[0].raw_synthetic_prob == 0.88
    assert call.risk_events[0].verdict == "cloned"


def test_database_speaker_repository_contract(test_db):
    db, session_factory = test_db
    repo = DatabaseSpeakerRepository(session_factory=session_factory)

    # 1. Create unit-norm 192-D embedding
    raw_vec = np.ones(192, dtype=np.float32)
    norm_vec = raw_vec / np.linalg.norm(raw_vec)

    profile = SpeakerProfile(
        speaker_id="executive_cfo",
        reference_embedding=norm_vec,
        embedding_dim=192,
        sample_count=3,
        metadata={"quality": "high"},
    )

    # 2. Save profile
    repo.save_profile(profile)

    # 3. Check has_speaker and list_speakers
    assert repo.has_speaker("executive_cfo") is True
    assert "executive_cfo" in repo.list_speakers()

    # 4. Retrieve profile
    retrieved = repo.get_profile("executive_cfo")
    assert retrieved is not None
    assert retrieved.speaker_id == "executive_cfo"
    assert retrieved.embedding_dim == 192
    assert retrieved.sample_count == 3
    assert np.allclose(retrieved.reference_embedding, norm_vec, atol=1e-5)

    # 5. Retrieve reference embedding directly
    ref_emb = repo.get_reference_embedding("executive_cfo")
    assert ref_emb is not None
    assert np.allclose(ref_emb, norm_vec, atol=1e-5)

    # 6. Delete profile
    deleted = repo.delete_profile("executive_cfo")
    assert deleted is True
    assert repo.has_speaker("executive_cfo") is False
    assert repo.get_profile("executive_cfo") is None
