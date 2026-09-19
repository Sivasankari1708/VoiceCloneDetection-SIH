"""
backend/platform/server/app.py
==============================
Main FastAPI application factory for Member 2 Backend Platform.
Initializes database schema, seed data, CORS, and mounts all REST & WebSocket routes.
"""

from __future__ import annotations

import contextlib
import json
import logging
import numpy as np

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.platform.config import platform_config
from backend.platform.db.models import Organization, ProtectedIdentity, SecurityPolicy, SpeakerProfileModel, User
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
from backend.platform.server.routes.tts import router as tts_router
from backend.platform.server.routes.websocket_stream import router as websocket_router
from backend.platform.services.ai_adapter import AIAdapter
from backend.platform.services.auth_service import hash_password

log = logging.getLogger("voice_clone_platform")


def _generate_synthetic_embedding(speaker_id: str, dim: int = 192) -> List[float]:
    """Generate deterministic L2-normalized 192-D speaker embedding."""
    seed = sum(ord(c) for c in speaker_id) * 31
    rng = np.random.RandomState(seed)
    vec = rng.randn(dim).astype(np.float32)
    norm = float(np.linalg.norm(vec))
    if norm > 0:
        vec = vec / norm
    return vec.tolist()


def seed_demo_data(db: Session) -> None:
    """Seed 5 registered demo organizations, users, and protected identities."""
    # 5 Demo Organizations
    org_definitions = [
        {
            "id": "org_sbi",
            "name": "State Bank of India",
            "code": "SBI",
            "operator_user": "operator_sbi",
            "operator_email": "operator@sbi.co.in",
            "identities": [
                {
                    "id": "vip_sbi_001",
                    "name": "Vikram Singh",
                    "title": "Senior Bank Officer",
                    "department": "Retail & SME Banking",
                    "speaker_id": "SPK_SBI_01",
                    "phone": "+91-98111-22331",
                },
                {
                    "id": "vip_sbi_002",
                    "name": "Ananya Sharma",
                    "title": "Branch Manager",
                    "department": "Branch Operations",
                    "speaker_id": "SPK_SBI_02",
                    "phone": "+91-98111-22332",
                },
            ],
        },
        {
            "id": "org_iob",
            "name": "Indian Overseas Bank",
            "code": "IOB",
            "operator_user": "operator_iob",
            "operator_email": "operator@iob.in",
            "identities": [
                {
                    "id": "vip_iob_001",
                    "name": "Rajesh Kumar",
                    "title": "Bank Manager",
                    "department": "Branch Operations",
                    "speaker_id": "SPK_IOB_01",
                    "phone": "+91-98222-33441",
                },
                {
                    "id": "vip_iob_002",
                    "name": "Priya Nair",
                    "title": "Senior Officer",
                    "department": "Vigilance & Operations",
                    "speaker_id": "SPK_IOB_02",
                    "phone": "+91-98222-33442",
                },
            ],
        },
        {
            "id": "org_uidai",
            "name": "UIDAI",
            "code": "UIDAI",
            "operator_user": "operator_uidai",
            "operator_email": "operator@uidai.gov.in",
            "identities": [
                {
                    "id": "vip_uidai_001",
                    "name": "Arjun Mehta",
                    "title": "Senior Administrative Officer",
                    "department": "Identity Verification Directorate",
                    "speaker_id": "SPK_UIDAI_01",
                    "phone": "+91-98333-44551",
                },
                {
                    "id": "vip_uidai_002",
                    "name": "Neha Rao",
                    "title": "IT/Operations Officer",
                    "department": "Information Security & Operations",
                    "speaker_id": "SPK_UIDAI_02",
                    "phone": "+91-98333-44552",
                },
            ],
        },
        {
            "id": "org_police",
            "name": "Police Department",
            "code": "POLICE",
            "operator_user": "operator_police",
            "operator_email": "operator@police.gov.in",
            "identities": [
                {
                    "id": "vip_pol_001",
                    "name": "Vikram Reddy",
                    "title": "Senior Police Officer",
                    "department": "Crime Branch",
                    "speaker_id": "SPK_POL_01",
                    "phone": "+91-98444-55661",
                },
                {
                    "id": "vip_pol_002",
                    "name": "Kavya Menon",
                    "title": "Cyber Crime Officer",
                    "department": "Cyber Crime Division",
                    "speaker_id": "SPK_POL_02",
                    "phone": "+91-98444-55662",
                },
            ],
        },
        {
            "id": "org_drdo",
            "name": "DRDO",
            "code": "DRDO",
            "operator_user": "operator_drdo",
            "operator_email": "operator@drdo.gov.in",
            "identities": [
                {
                    "id": "vip_drdo_001",
                    "name": "Rohan Verma",
                    "title": "Research/IT Officer",
                    "department": "Information Systems & Defense",
                    "speaker_id": "SPK_DRDO_01",
                    "phone": "+91-98555-66771",
                },
                {
                    "id": "vip_drdo_002",
                    "name": "Meera Iyer",
                    "title": "Senior Research Officer",
                    "department": "Advanced Research Division",
                    "speaker_id": "SPK_DRDO_02",
                    "phone": "+91-98555-66772",
                },
            ],
        },
    ]

    for org_def in org_definitions:
        # Organization
        org = db.query(Organization).filter((Organization.id == org_def["id"]) | (Organization.code == org_def["code"])).first()
        if not org:
            org = Organization(
                id=org_def["id"],
                name=org_def["name"],
                code=org_def["code"],
            )
            db.add(org)
            db.flush()
        else:
            org.name = org_def["name"]
            org.code = org_def["code"]

        # Security Policy
        policy = db.query(SecurityPolicy).filter_by(org_id=org.id).first()
        if not policy:
            policy = SecurityPolicy(
                org_id=org.id,
                policy_config_json='{"risk_score_high_threshold": 65.0, "risk_score_critical_threshold": 80.0, "auto_warn_user_on_high": true, "auto_alert_org_on_high": true, "auto_block_on_critical_clone": false, "enforce_protected_vip_rules": true, "sensitive_intent_escalation": true}',
            )
            db.add(policy)

        # Operator Account
        op = db.query(User).filter((User.username == org_def["operator_user"]) | (User.email == org_def["operator_email"])).first()
        if not op:
            op = User(
                id=f"user_{org_def['operator_user']}",
                org_id=org.id,
                username=org_def["operator_user"],
                email=org_def["operator_email"],
                hashed_password=hash_password("operator123"),
                full_name=f"{org_def['name']} SOC Operator",
                role="SECURITY_OPERATOR",
            )
            db.add(op)
        else:
            op.org_id = org.id
            op.hashed_password = hash_password("operator123")
            op.role = "SECURITY_OPERATOR"

        # Protected Identities & Speaker Profiles
        for ident in org_def["identities"]:
            prot = db.query(ProtectedIdentity).filter_by(speaker_id=ident["speaker_id"]).first()
            if not prot:
                prot = ProtectedIdentity(
                    id=ident["id"],
                    org_id=org.id,
                    full_name=ident["name"],
                    title=ident["title"],
                    department=ident["department"],
                    email=f"{ident['name'].lower().replace(' ', '.')}@{org_def['code'].lower()}.gov.in",
                    phone=ident["phone"],
                    risk_priority="CRITICAL",
                    speaker_id=ident["speaker_id"],
                )
                db.add(prot)
                db.flush()
            else:
                prot.org_id = org.id
                prot.full_name = ident["name"]
                prot.title = ident["title"]
                prot.department = ident["department"]

            # Biometric Speaker Profile with ECAPA-TDNN 192-D Vector
            profile_model = db.query(SpeakerProfileModel).filter_by(speaker_id=ident["speaker_id"]).first()
            emb_vec = _generate_synthetic_embedding(ident["speaker_id"])
            emb_json = json.dumps(emb_vec)
            meta_json = json.dumps({
                "enrollment_source": "studio_reference_mic",
                "sample_rate": 16000,
                "model": "SpeechBrain ECAPA-TDNN (192-D)",
                "consistency_score": 0.95,
                "snr_db": 31.4,
            })
            if not profile_model:
                profile_model = SpeakerProfileModel(
                    protected_identity_id=prot.id,
                    speaker_id=ident["speaker_id"],
                    embedding_dim=192,
                    sample_count=5,
                    embedding_vector_json=emb_json,
                    metadata_json=meta_json,
                )
                db.add(profile_model)
            else:
                profile_model.protected_identity_id = prot.id
                profile_model.embedding_vector_json = emb_json
                profile_model.metadata_json = meta_json

    # Default 'operator' user points to IOB for standard login convenience
    default_op = db.query(User).filter_by(username="operator").first()
    if not default_op:
        default_op = User(
            id="user_operator_default",
            org_id="org_iob",
            username="operator",
            email="operator@iob.in",
            hashed_password=hash_password("operator123"),
            full_name="Rajesh Kumar (IOB SOC)",
            role="SECURITY_OPERATOR",
        )
        db.add(default_op)
    else:
        default_op.org_id = "org_iob"
        default_op.hashed_password = hash_password("operator123")

    # Target Citizen: Sreya Sengupta (org_id = None)
    sreya = db.query(User).filter((User.username == "sreya") | (User.email == "sreya@demo.com")).first()
    if not sreya:
        sreya = User(
            id="user_sreya_001",
            org_id=None,
            username="sreya",
            email="sreya@demo.com",
            hashed_password=hash_password("sreya123"),
            full_name="Sreya Sengupta",
            role="USER",
        )
        db.add(sreya)
    else:
        sreya.org_id = None
        sreya.full_name = "Sreya Sengupta"
        sreya.role = "USER"
        sreya.hashed_password = hash_password("sreya123")

    # Attacker / Caller Persona (org_id = None, role = CALLER)
    attacker = db.query(User).filter((User.username == "attacker") | (User.email == "attacker@demo.com")).first()
    if not attacker:
        attacker = User(
            id="user_attacker_001",
            org_id=None,
            username="attacker",
            email="attacker@demo.com",
            hashed_password=hash_password("attacker123"),
            full_name="VoiceShield Attack Simulator",
            role="CALLER",
        )
        db.add(attacker)
    else:
        attacker.org_id = None
        attacker.full_name = "VoiceShield Attack Simulator"
        attacker.role = "CALLER"
        attacker.hashed_password = hash_password("attacker123")

    db.commit()
    log.info("[Seed] Initialized 5 organizations: SBI, IOB, UIDAI, Police Department, DRDO, plus 10 protected identities.")


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
    app.include_router(tts_router)

    # Include WebSocket routes
    app.include_router(websocket_router)

    return app


# Root application instance for uvicorn
app = create_app()
