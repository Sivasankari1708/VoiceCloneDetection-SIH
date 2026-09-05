"""
backend/platform/tests/test_auth.py
===================================
Tests for authentication, authorization, and multi-tenant organization isolation.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.platform.db.models import Organization, User
from backend.platform.db.session import Base
from backend.platform.server.dependencies import require_role
from backend.platform.services.auth_service import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


@pytest.fixture
def auth_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()
    try:
        org_a = Organization(id="org_a", name="Org Alpha", code="ALPHA")
        org_b = Organization(id="org_b", name="Org Beta", code="BETA")
        db.add_all([org_a, org_b])
        db.flush()

        user_a = User(
            id="user_a",
            org_id="org_a",
            username="alice",
            email="alice@alpha.com",
            hashed_password=hash_password("alice_pass"),
            full_name="Alice Alpha",
            role="USER",
        )
        operator_b = User(
            id="op_b",
            org_id="org_b",
            username="bob_sec",
            email="bob@beta.com",
            hashed_password=hash_password("bob_pass"),
            full_name="Bob Operator",
            role="SECURITY_OPERATOR",
        )
        db.add_all([user_a, operator_b])
        db.commit()
        yield db, user_a, operator_b
    finally:
        db.close()


def test_password_hashing():
    pwd = "SecurePassword123!"
    hashed = hash_password(pwd)
    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword", hashed) is False


def test_jwt_token_creation_and_decoding(auth_db):
    _, user_a, _ = auth_db
    token = create_access_token(user_a)
    payload = decode_access_token(token)

    assert payload is not None
    assert payload["sub"] == user_a.id
    assert payload["username"] == user_a.username
    assert payload["role"] == "USER"
    assert payload["org_id"] == "org_a"


def test_role_based_access_control(auth_db):
    _, user_a, operator_b = auth_db

    checker = require_role(["SECURITY_OPERATOR", "ADMIN"])

    # Operator should pass
    validated_op = checker(operator_b)
    assert validated_op.id == operator_b.id

    # Normal user should be rejected with 403 Forbidden
    with pytest.raises(HTTPException) as exc_info:
        checker(user_a)
    assert exc_info.value.status_code == 403
