"""
backend/platform/tests/test_api.py
==================================
Integration tests for FastAPI REST API endpoints.
"""

import uuid
import pytest
from fastapi.testclient import TestClient

from backend.platform.db.models import User
from backend.platform.db.session import SessionLocal, init_db
from backend.platform.server.app import app
from backend.platform.services.auth_service import create_access_token


@pytest.fixture(scope="module")
def client():
    init_db()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def tokens():
    db = SessionLocal()
    try:
        admin = db.query(User).filter_by(username="admin").first()
        operator = db.query(User).filter_by(username="operator").first()
        employee = db.query(User).filter_by(username="employee").first()

        return {
            "admin": create_access_token(admin),
            "operator": create_access_token(operator),
            "employee": create_access_token(employee),
            "org_id": admin.org_id,
        }
    finally:
        db.close()


def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["database_connected"] is True
    assert data["ai_pipeline_loaded"] is True
    assert "components" in data


def test_auth_login_and_me(client, tokens):
    # Test valid login
    res = client.post("/api/auth/login", json={"username": "employee", "password": "employee123"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["username"] == "employee"

    # Test /api/auth/me with token
    res_me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {tokens['employee']}"},
    )
    assert res_me.status_code == 200
    assert res_me.json()["username"] == "employee"

    # Test invalid login
    bad_res = client.post("/api/auth/login", json={"username": "employee", "password": "WrongPassword"})
    assert bad_res.status_code == 401


def test_protected_identities_endpoints(client, tokens):
    # List identities
    res = client.get(
        "/api/protected-identities",
        headers={"Authorization": f"Bearer {tokens['operator']}"},
    )
    assert res.status_code == 200
    identities = res.json()
    assert len(identities) >= 1
    cfo = identities[0]
    assert cfo["title"] == "Chief Financial Officer"

    # Create new identity as admin
    spk_id = f"vip_ceo_{uuid.uuid4().hex[:6]}"
    new_vip = {
        "full_name": "Sarah Connor",
        "title": "Chief Executive Officer",
        "department": "Executive",
        "risk_priority": "CRITICAL",
        "speaker_id": spk_id,
    }
    create_res = client.post(
        "/api/protected-identities",
        json=new_vip,
        headers={"Authorization": f"Bearer {tokens['admin']}"},
    )
    assert create_res.status_code == 201
    assert create_res.json()["speaker_id"] == spk_id


def test_calls_lifecycle_api(client, tokens):
    # Start call
    start_payload = {
        "caller_number": "+1-555-8888",
        "caller_name": "Unknown Inbound",
        "claimed_speaker_id": "LA_0069",
    }
    start_res = client.post(
        "/api/calls/start",
        json=start_payload,
        headers={"Authorization": f"Bearer {tokens['employee']}"},
    )
    assert start_res.status_code == 201
    call_data = start_res.json()
    session_id = call_data["session_id"]
    assert session_id is not None
    assert call_data["status"] == "ACTIVE"

    # Retrieve call
    get_res = client.get(
        f"/api/calls/{session_id}",
        headers={"Authorization": f"Bearer {tokens['employee']}"},
    )
    assert get_res.status_code == 200
    assert get_res.json()["session_id"] == session_id

    # End call
    end_res = client.post(
        f"/api/calls/{session_id}/end",
        json={"reason": "NORMAL_HANGUP"},
        headers={"Authorization": f"Bearer {tokens['employee']}"},
    )
    assert end_res.status_code == 200
    summary = end_res.json()
    assert summary["session_id"] == session_id


def test_policies_and_stats_endpoints(client, tokens):
    # Get policies
    pol_res = client.get(
        "/api/policies",
        headers={"Authorization": f"Bearer {tokens['operator']}"},
    )
    assert pol_res.status_code == 200
    assert "risk_score_critical_threshold" in pol_res.json()

    # Update policies as admin
    upd_res = client.put(
        "/api/policies",
        json={"risk_score_critical_threshold": 90.0},
        headers={"Authorization": f"Bearer {tokens['admin']}"},
    )
    assert upd_res.status_code == 200
    assert upd_res.json()["risk_score_critical_threshold"] == 90.0

    # Get stats
    stats_res = client.get(
        "/api/stats",
        headers={"Authorization": f"Bearer {tokens['operator']}"},
    )
    assert stats_res.status_code == 200
    stats_data = stats_res.json()
    assert "calls" in stats_data
    assert "incidents" in stats_data
