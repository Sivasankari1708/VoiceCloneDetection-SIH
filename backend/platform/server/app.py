"""
backend/platform/server/app.py
==============================
Main FastAPI application factory for Member 2 Backend Platform.
Initializes database schema, seed data, CORS, and mounts all REST & WebSocket routes.
"""

from __future__ import annotations

import contextlib
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.platform.config import platform_config
from backend.platform.db.models import Organization, ProtectedIdentity, SecurityPolicy, User
from backend.platform.db.session import SessionLocal, init_db
from backend.platform.server.routes.analyze import router as analyze_router
from backend.platform.server.routes.audit import router as audit_router
from backend.platform.server.routes.auth import router as auth_router
from backend.platform.server.routes.calls import router as calls_router
from backend.platform.server.routes.health import router as health_router
from backend.platform.server.routes.incidents import router as incidents_router
from backend.platform.server.routes.organizations import router as org_router
from backend.platform.server.routes.policies import router as policies_router
from backend.platform.server.routes.protected_identities import router as protected_identities_router
from backend.platform.server.routes.websocket_stream import router as websocket_router
from backend.platform.services.ai_adapter import AIAdapter
from backend.platform.services.auth_service import hash_password

log = logging.getLogger("voice_clone_platform")


def seed_demo_data(db: Session) -> None:
    """Seed initial demo organizations, users, and protected identities with Indian personas."""
    # 1. Org A: Apex Financial Corp (Claimed / Impersonated Organization)
    org = db.query(Organization).filter_by(id="org_demo_001").first()
    if not org:
        org = Organization(
            id="org_demo_001",
            name="Apex Financial Corp",
            code="APEX_FIN",
        )
        db.add(org)
        db.flush()
    else:
        org.name = "Apex Financial Corp"
        org.code = "APEX_FIN"

    # Security Policy for Apex Financial Corp
    policy = db.query(SecurityPolicy).filter_by(org_id=org.id).first()
    if not policy:
        policy = SecurityPolicy(
            org_id=org.id,
            policy_config_json='{"risk_score_high_threshold": 65.0, "risk_score_critical_threshold": 85.0, "auto_warn_user_on_high": true, "auto_alert_org_on_high": true, "auto_block_on_critical_clone": false, "enforce_protected_vip_rules": true, "sensitive_intent_escalation": true}',
        )
        db.add(policy)

    # Operator for Apex Financial Corp SOC: Priya Nair
    operator_user = db.query(User).filter_by(username="operator").first()
    if not operator_user:
        operator_user = User(
            id="user_operator_001",
            org_id=org.id,
            username="operator",
            email="priya.nair@apexfin.com",
            hashed_password=hash_password("operator123"),
            full_name="Priya Nair (SOC Operator)",
            role="SECURITY_OPERATOR",
        )
        db.add(operator_user)
    else:
        operator_user.org_id = org.id
        operator_user.full_name = "Priya Nair (SOC Operator)"
        operator_user.email = "priya.nair@apexfin.com"

    # Admin for Apex Financial Corp
    admin_user = db.query(User).filter_by(username="admin").first()
    if not admin_user:
        admin_user = User(
            id="user_admin_001",
            org_id=org.id,
            username="admin",
            email="admin@apexfin.com",
            hashed_password=hash_password("admin123"),
            full_name="Apex System Admin",
            role="ADMIN",
        )
        db.add(admin_user)

    # Protected Identity: Rajesh Malhotra, CFO of Apex Financial Corp
    cfo_identity = db.query(ProtectedIdentity).filter_by(speaker_id="LA_0069").first()
    if not cfo_identity:
        cfo_identity = ProtectedIdentity(
            id="vip_cfo_001",
            org_id=org.id,
            full_name="Rajesh Malhotra",
            title="Chief Financial Officer",
            department="Executive Leadership",
            email="rajesh.malhotra@apexfin.com",
            phone="+91-98200-11223",
            risk_priority="CRITICAL",
            speaker_id="LA_0069",
        )
        db.add(cfo_identity)
    else:
        cfo_identity.org_id = org.id
        cfo_identity.full_name = "Rajesh Malhotra"
        cfo_identity.title = "Chief Financial Officer"
        cfo_identity.department = "Executive Leadership"
        cfo_identity.email = "rajesh.malhotra@apexfin.com"
        cfo_identity.phone = "+91-98200-11223"

    # 2. Independent Citizen / Target Individual: Sreya Sengupta (org_id = None)
    sreya_user = db.query(User).filter((User.username == "sreya") | (User.email == "sreya@demo.com")).first()
    if not sreya_user:
        sreya_user = User(
            id="user_sreya_001",
            org_id=None,
            username="sreya",
            email="sreya@demo.com",
            hashed_password=hash_password("sreya123"),
            full_name="Sreya Sengupta",
            role="USER",
        )
        db.add(sreya_user)
    else:
        sreya_user.org_id = None
        sreya_user.full_name = "Sreya Sengupta"
        sreya_user.email = "sreya@demo.com"
        sreya_user.role = "USER"
        sreya_user.hashed_password = hash_password("sreya123")

    # Attacker / Caller Persona (org_id = None, role = CALLER)
    attacker_user = db.query(User).filter((User.username == "attacker") | (User.email == "attacker@demo.com")).first()
    if not attacker_user:
        attacker_user = User(
            id="user_attacker_001",
            org_id=None,
            username="attacker",
            email="attacker@demo.com",
            hashed_password=hash_password("attacker123"),
            full_name="External Attacker / Caller",
            role="CALLER",
        )
        db.add(attacker_user)
    else:
        attacker_user.org_id = None
        attacker_user.full_name = "External Attacker / Caller"
        attacker_user.email = "attacker@demo.com"
        attacker_user.role = "CALLER"
        attacker_user.hashed_password = hash_password("attacker123")

    # External Caller Simulator (backward compatibility for existing tests)
    caller_user = db.query(User).filter_by(username="caller").first()
    if not caller_user:
        caller_user = User(
            id="user_caller_001",
            org_id=None,
            username="caller",
            email="aarav@external.net",
            hashed_password=hash_password("caller123"),
            full_name="Aarav Sharma (External Caller)",
            role="CALLER",
        )
        db.add(caller_user)
    else:
        caller_user.org_id = None
        caller_user.role = "CALLER"
        caller_user.full_name = "Aarav Sharma (External Caller)"

    # 3. Org B: Kavach Cyber Defense (Unrelated Org for multi-tenant isolation testing)
    org_b = db.query(Organization).filter((Organization.id == "org_cyber_002") | (Organization.code == "KAVACH") | (Organization.code == "CYBERGUARD")).first()
    if not org_b:
        org_b = Organization(
            id="org_cyber_002",
            name="Kavach Cyber Defense",
            code="KAVACH",
        )
        db.add(org_b)
        db.flush()
    else:
        org_b.name = "Kavach Cyber Defense"
        org_b.code = "KAVACH"

    policy_b = db.query(SecurityPolicy).filter_by(org_id=org_b.id).first()
    if not policy_b:
        policy_b = SecurityPolicy(
            org_id=org_b.id,
            policy_config_json='{"risk_score_high_threshold": 65.0, "risk_score_critical_threshold": 85.0, "auto_warn_user_on_high": true, "auto_alert_org_on_high": true, "auto_block_on_critical_clone": false, "enforce_protected_vip_rules": true, "sensitive_intent_escalation": true}',
        )
        db.add(policy_b)

    operator_b = db.query(User).filter_by(username="operator_b").first()
    if not operator_b:
        operator_b = User(
            id="user_operator_b",
            org_id=org_b.id,
            username="operator_b",
            email="arjun.verma@kavach.in",
            hashed_password=hash_password("operator123"),
            full_name="Arjun Verma (Kavach SOC)",
            role="SECURITY_OPERATOR",
        )
        db.add(operator_b)
    else:
        operator_b.org_id = org_b.id
        operator_b.full_name = "Arjun Verma (Kavach SOC)"
        operator_b.email = "arjun.verma@kavach.in"

    db.commit()
    log.info("[Seed] Platform initialization complete: Sreya Sengupta (Citizen), Rajesh Malhotra (CFO), Priya Nair (Apex SOC), Arjun Verma (Kavach SOC).")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context for startup initialization and cleanup."""
    log.info("Starting VoiceCloneDetection-SIH Platform Gateway...")
    init_db()
    db = SessionLocal()
    try:
        seed_demo_data(db)
    finally:
        db.close()

    # Pre-warm AI adapter & load models once
    AIAdapter.get_instance()
    log.info("VoiceCloneDetection-SIH Platform ready to serve requests.")
    yield
    log.info("Shutting down VoiceCloneDetection-SIH Platform Gateway...")


def create_app() -> FastAPI:
    """FastAPI application factory."""
    app = FastAPI(
        title="VoiceCloneDetection-SIH Platform API",
        description=(
            "Backend Platform & Security Orchestration Gateway for Real-Time "
            "Detection & Prevention of Voice-Cloning Impersonation Attacks (Smart India Hackathon)."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=platform_config.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include REST routers
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(org_router)
    app.include_router(protected_identities_router)
    app.include_router(calls_router)
    app.include_router(incidents_router)
    app.include_router(policies_router)
    app.include_router(audit_router)
    app.include_router(analyze_router)

    # Include WebSocket routes
    app.include_router(websocket_router)

    return app


# Root application instance for uvicorn
app = create_app()
