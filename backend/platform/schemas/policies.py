"""
backend/platform/schemas/policies.py
====================================
Schemas for Organization Security Policies.
"""

from __future__ import annotations

from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class SecurityPolicyDto(BaseModel):
    org_id: str
    risk_score_high_threshold: float = 65.0
    risk_score_critical_threshold: float = 85.0
    auto_warn_user_on_high: bool = True
    auto_alert_org_on_high: bool = True
    auto_block_on_critical_clone: bool = False
    enforce_protected_vip_rules: bool = True
    sensitive_intent_escalation: bool = True
    custom_rules: Dict[str, Any] = {}
    updated_at: Optional[str] = None


class PolicyUpdateDto(BaseModel):
    risk_score_high_threshold: Optional[float] = None
    risk_score_critical_threshold: Optional[float] = None
    auto_warn_user_on_high: Optional[bool] = None
    auto_alert_org_on_high: Optional[bool] = None
    auto_block_on_critical_clone: Optional[bool] = None
    enforce_protected_vip_rules: Optional[bool] = None
    sensitive_intent_escalation: Optional[bool] = None
    custom_rules: Optional[Dict[str, Any]] = None
