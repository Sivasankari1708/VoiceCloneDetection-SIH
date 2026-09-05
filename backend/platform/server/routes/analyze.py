"""
backend/platform/server/routes/analyze.py
=========================================
Batch audio analysis endpoint using Member 1's InferencePipeline.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from backend.platform.db.models import User
from backend.platform.db.session import get_db
from backend.platform.server.dependencies import get_current_user
from backend.platform.services.ai_adapter import AIAdapter

router = APIRouter(prefix="/api/analyze", tags=["Batch Analysis"])


@router.post("/file")
async def analyze_audio_file(
    file: UploadFile = File(...),
    claimed_speaker_id: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Run full batch acoustic and biometric analysis on an uploaded audio file
    (WAV, FLAC, MP3, OGG, WebM) using Member 1's unified InferencePipeline.
    """
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio file provided.")

    ai_adapter = AIAdapter.get_instance()
    try:
        inf_result, risk_decision = ai_adapter.analyze_batch_file(
            file_path_or_bytes=audio_bytes,
            claimed_speaker_id=claimed_speaker_id,
        )

        return {
            "filename": file.filename,
            "claimed_speaker_id": claimed_speaker_id,
            "inference": inf_result.to_dict(),
            "risk_decision": {
                "risk_score": risk_decision.risk_score,
                "risk_level": risk_decision.risk_level,
                "reasons": risk_decision.reasons,
                "recommended_action": risk_decision.recommended_action,
                "scenario": risk_decision.scenario,
                "breakdown": risk_decision.breakdown,
            },
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Inference analysis failed: {str(exc)}",
        )
