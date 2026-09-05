"""
backend/platform/server/routes/health.py
======================================
System health, telemetry, and platform statistics endpoints.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.platform.db.models import CallSession, ProtectedIdentity, SecurityIncident, User
from backend.platform.db.session import get_db
from backend.platform.server.dependencies import get_current_user
from backend.platform.services.ai_adapter import AIAdapter

router = APIRouter(prefix="/api", tags=["System & Telemetry"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Verify backend platform, database connectivity, and Member 1 AI models status."""
    db_ok = False
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    ai_adapter = AIAdapter.get_instance()
    ai_ok = ai_adapter.pipeline is not None and ai_adapter.streaming_pipeline is not None

    return {
        "status": "healthy" if (db_ok and ai_ok) else "degraded",
        "database_connected": db_ok,
        "ai_pipeline_loaded": ai_ok,
        "components": {
            "vad": "SileroVAD (active)",
            "deepfake_detector": "DeepfakeCNN v2 (ASVspoof 2019 LA)",
            "speaker_verifier": "SpeechBrain ECAPA-TDNN (192-D)",
            "whisper_asr": "faster-whisper (int8 CPU)",
            "intent_detector": "IntentDetector (active)",
            "risk_engine": "RiskEngine (active)",
        },
    }


@router.get("/stats")
def get_stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Retrieve organization security telemetry and attack mitigation metrics."""
    org_id = user.org_id

    total_calls = db.query(CallSession).filter_by(org_id=org_id).count()
    active_calls = db.query(CallSession).filter_by(org_id=org_id, status="ACTIVE").count()
    clones_detected = db.query(CallSession).filter(
        CallSession.org_id == org_id,
        CallSession.final_verdict == "cloned",
    ).count()

    total_incidents = db.query(SecurityIncident).filter_by(org_id=org_id).count()
    open_incidents = db.query(SecurityIncident).filter(
        SecurityIncident.org_id == org_id,
        SecurityIncident.status.in_(["OPEN", "UNDER_REVIEW"]),
    ).count()
    confirmed_attacks = db.query(SecurityIncident).filter_by(
        org_id=org_id, status="CONFIRMED_ATTACK"
    ).count()

    protected_vips = db.query(ProtectedIdentity).filter_by(org_id=org_id, is_active=True).count()

    return {
        "org_id": org_id,
        "calls": {
            "total": total_calls,
            "active": active_calls,
            "clones_detected": clones_detected,
        },
        "incidents": {
            "total": total_incidents,
            "open": open_incidents,
            "confirmed_attacks": confirmed_attacks,
        },
        "protected_identities": protected_vips,
    }
