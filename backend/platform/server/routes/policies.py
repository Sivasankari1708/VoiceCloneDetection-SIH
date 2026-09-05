"""
backend/platform/server/routes/policies.py
==========================================
Security Policy configuration endpoints.
"""

from __future__ import annotations

import json
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from backend.platform.db.models import SecurityPolicy, User, utcnow
from backend.platform.db.session import get_db
from backend.platform.schemas.policies import PolicyUpdateDto, SecurityPolicyDto
from backend.platform.server.dependencies import get_current_user, require_role

router = APIRouter(prefix="/api/policies", tags=["Security Policies"])


@router.get("", response_model=SecurityPolicyDto)
def get_policy(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retrieve organization security policy configuration."""
    policy = db.query(SecurityPolicy).filter_by(org_id=user.org_id).first()
    if not policy:
        # Return default policy
        return SecurityPolicyDto(org_id=user.org_id)

    cfg = {}
    try:
        cfg = json.loads(policy.policy_config_json)
    except Exception:
        pass

    return SecurityPolicyDto(
        org_id=user.org_id,
        risk_score_high_threshold=cfg.get("risk_score_high_threshold", 65.0),
        risk_score_critical_threshold=cfg.get("risk_score_critical_threshold", 85.0),
        auto_warn_user_on_high=cfg.get("auto_warn_user_on_high", True),
        auto_alert_org_on_high=cfg.get("auto_alert_org_on_high", True),
        auto_block_on_critical_clone=cfg.get("auto_block_on_critical_clone", False),
        enforce_protected_vip_rules=cfg.get("enforce_protected_vip_rules", True),
        sensitive_intent_escalation=cfg.get("sensitive_intent_escalation", True),
        custom_rules=cfg.get("custom_rules", {}),
        updated_at=policy.updated_at.isoformat() if policy.updated_at else None,
    )


@router.put("", response_model=SecurityPolicyDto)
def update_policy(
    req: PolicyUpdateDto,
    user: User = Depends(require_role(["ADMIN"])),
    db: Session = Depends(get_db),
):
    """Update organization security policy configuration."""
    policy = db.query(SecurityPolicy).filter_by(org_id=user.org_id).first()
    cfg = {}
    if policy:
        try:
            cfg = json.loads(policy.policy_config_json)
        except Exception:
            pass
    else:
        policy = SecurityPolicy(org_id=user.org_id, policy_config_json="{}")
        db.add(policy)

    if req.risk_score_high_threshold is not None:
        cfg["risk_score_high_threshold"] = req.risk_score_high_threshold
    if req.risk_score_critical_threshold is not None:
        cfg["risk_score_critical_threshold"] = req.risk_score_critical_threshold
    if req.auto_warn_user_on_high is not None:
        cfg["auto_warn_user_on_high"] = req.auto_warn_user_on_high
    if req.auto_alert_org_on_high is not None:
        cfg["auto_alert_org_on_high"] = req.auto_alert_org_on_high
    if req.auto_block_on_critical_clone is not None:
        cfg["auto_block_on_critical_clone"] = req.auto_block_on_critical_clone
    if req.enforce_protected_vip_rules is not None:
        cfg["enforce_protected_vip_rules"] = req.enforce_protected_vip_rules
    if req.sensitive_intent_escalation is not None:
        cfg["sensitive_intent_escalation"] = req.sensitive_intent_escalation
    if req.custom_rules is not None:
        cfg["custom_rules"] = req.custom_rules

    policy.policy_config_json = json.dumps(cfg)
    policy.updated_at = utcnow()
    db.commit()

    return SecurityPolicyDto(
        org_id=user.org_id,
        risk_score_high_threshold=cfg.get("risk_score_high_threshold", 65.0),
        risk_score_critical_threshold=cfg.get("risk_score_critical_threshold", 85.0),
        auto_warn_user_on_high=cfg.get("auto_warn_user_on_high", True),
        auto_alert_org_on_high=cfg.get("auto_alert_org_on_high", True),
        auto_block_on_critical_clone=cfg.get("auto_block_on_critical_clone", False),
        enforce_protected_vip_rules=cfg.get("enforce_protected_vip_rules", True),
        sensitive_intent_escalation=cfg.get("sensitive_intent_escalation", True),
        custom_rules=cfg.get("custom_rules", {}),
        updated_at=policy.updated_at.isoformat() if policy.updated_at else None,
    )
