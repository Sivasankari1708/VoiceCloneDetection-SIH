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
    """Seed default organization, demo users, policies, and protected CFO identity."""
    existing_org = db.query(Organization).filter_by(code="DEMO_CORP").first()
    if not existing_org:
        org = Organization(
            id="org_demo_001",
            name="Apex Financial Corp (Demo)",
            code="DEMO_CORP",
        )
        db.add(org)
        db.flush()

        # Seed default Security Policy
        policy = SecurityPolicy(
            org_id=org.id,
            policy_config_json='{"risk_score_high_threshold": 65.0, "risk_score_critical_threshold": 85.0, "auto_warn_user_on_high": true, "auto_alert_org_on_high": true, "auto_block_on_critical_clone": false, "enforce_protected_vip_rules": true, "sensitive_intent_escalation": true}',
        )
        db.add(policy)

        # Seed Users: Admin, Security Operator, Employee
        admin_user = User(
            id="user_admin_001",
            org_id=org.id,
            username="admin",
            email="admin@apexcorp.com",
            hashed_password=hash_password("admin123"),
            full_name="System Administrator",
            role="ADMIN",
        )
        operator_user = User(
            id="user_operator_001",
            org_id=org.id,
            username="operator",
            email="soc@apexcorp.com",
            hashed_password=hash_password("operator123"),
            full_name="Security Operations Lead",
            role="SECURITY_OPERATOR",
        )
        employee_user = User(
            id="user_employee_001",
            org_id=org.id,
            username="employee",
            email="alice@apexcorp.com",
            hashed_password=hash_password("employee123"),
            full_name="Alice Johnson (Finance)",
            role="USER",
        )
        db.add_all([admin_user, operator_user, employee_user])

        # Seed Protected Identity: Chief Financial Officer
        cfo_identity = ProtectedIdentity(
            id="vip_cfo_001",
            org_id=org.id,
            full_name="David Vance",
            title="Chief Financial Officer",
            department="Executive Management",
            email="cfo@apexcorp.com",
            phone="+1-555-0199",
            risk_priority="CRITICAL",
            speaker_id="LA_0069",  # Maps to genuine enrolled speaker in Member 1 ASVspoof test set
        )
        db.add(cfo_identity)
        db.commit()
        log.info("[Seed] Demo organization, users (admin, operator, employee), and protected CFO created.")


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
