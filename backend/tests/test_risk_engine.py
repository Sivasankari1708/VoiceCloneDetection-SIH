"""
backend/tests/test_risk_engine.py
=================================
Unit test suite for the security decision & risk engine (backend/pipeline/risk_engine.py).

Covers:
  1. Real enrolled voice (Scenario A) -> SAFE / ALLOW
  2. Different real speaker (Scenario B) -> MEDIUM / VERIFY_SPEAKER
  3. AI clone of enrolled speaker (Scenario C) -> CRITICAL / BLOCK_OR_ESCALATE
  4. Unknown AI voice (Scenario D) -> HIGH/CRITICAL / BLOCK_OR_ESCALATE
  5. Sensitive intent escalation: PAYMENT_TRANSFER
  6. Sensitive intent escalation: OTP_REQUEST
  7. Sensitive intent escalation: CREDENTIAL_REQUEST
  8. Normal conversation baseline
  9. Configurable threshold overrides
  10. Direct evaluation from canonical InferenceResult
"""

from __future__ import annotations

import pytest

from backend.pipeline.risk_engine import (
    RecommendedAction,
    RiskDecision,
    RiskEngine,
    RiskEngineConfig,
    RiskLevel,
    SecurityScenario,
)
from backend.schemas.inference_result import InferenceResult


@pytest.fixture
def engine() -> RiskEngine:
    return RiskEngine()


# ─────────────────────────────────────────────────────────────────────────────
# 1. Real Enrolled Voice (Scenario A)
# ─────────────────────────────────────────────────────────────────────────────

def test_real_enrolled_voice_normal_conversation(engine: RiskEngine):
    """
    Scenario A: Real enrolled speaker.
    High similarity, low synthetic prob, normal intent -> SAFE / ALLOW.
    """
    decision = engine.evaluate(
        speaker_similarity=0.86,
        speaker_match=True,
        synthetic_probability=0.08,
        intent="NORMAL_CONVERSATION",
        intent_confidence=0.8,
    )
    assert decision.risk_level == RiskLevel.SAFE.value
    assert decision.recommended_action == RecommendedAction.ALLOW.value
    assert decision.scenario == SecurityScenario.GENUINE_ENROLLED_SPEAKER.value
    assert decision.risk_score < 25.0
    assert any("VERIFIED" in r for r in decision.reasons)


# ─────────────────────────────────────────────────────────────────────────────
# 2. Different Real Speaker (Scenario B)
# ─────────────────────────────────────────────────────────────────────────────

def test_different_real_speaker(engine: RiskEngine):
    """
    Scenario B: Different genuine human speaker.
    Low similarity, low synthetic prob -> MEDIUM / VERIFY_SPEAKER.
    """
    decision = engine.evaluate(
        speaker_similarity=0.22,
        speaker_match=False,
        synthetic_probability=0.06,
        intent="NORMAL_CONVERSATION",
        intent_confidence=0.7,
    )
    assert decision.risk_level == RiskLevel.MEDIUM.value
    assert decision.recommended_action == RecommendedAction.VERIFY_SPEAKER.value
    assert decision.scenario == SecurityScenario.DIFFERENT_GENUINE_SPEAKER.value
    assert any("mismatch" in r.lower() for r in decision.reasons)


# ─────────────────────────────────────────────────────────────────────────────
# 3. AI Clone of Enrolled Speaker (Scenario C)
# ─────────────────────────────────────────────────────────────────────────────

def test_ai_clone_of_enrolled_speaker(engine: RiskEngine):
    """
    Scenario C: AI clone impersonating the enrolled speaker.
    High similarity (voice sounds like user) + high synthetic prob -> CRITICAL / BLOCK_OR_ESCALATE.
    """
    decision = engine.evaluate(
        speaker_similarity=0.89,
        speaker_match=True,
        synthetic_probability=0.88,
        intent="NORMAL_CONVERSATION",
        intent_confidence=0.5,
    )
    assert decision.risk_level == RiskLevel.CRITICAL.value
    assert decision.recommended_action == RecommendedAction.BLOCK_OR_ESCALATE.value
    assert decision.scenario == SecurityScenario.AI_CLONE_ENROLLED_SPEAKER.value
    assert decision.risk_score >= 85.0
    assert any("clone" in r.lower() for r in decision.reasons)


# ─────────────────────────────────────────────────────────────────────────────
# 4. Unknown AI Voice (Scenario D)
# ─────────────────────────────────────────────────────────────────────────────

def test_unknown_ai_voice(engine: RiskEngine):
    """
    Scenario D: Synthetic / AI voice from an unknown speaker.
    Low similarity + high synthetic prob -> HIGH or CRITICAL / BLOCK_OR_ESCALATE.
    """
    decision = engine.evaluate(
        speaker_similarity=0.18,
        speaker_match=False,
        synthetic_probability=0.85,
        intent="NORMAL_CONVERSATION",
        intent_confidence=0.5,
    )
    assert decision.risk_level in (RiskLevel.HIGH.value, RiskLevel.CRITICAL.value)
    assert decision.recommended_action == RecommendedAction.BLOCK_OR_ESCALATE.value
    assert decision.scenario == SecurityScenario.UNKNOWN_AI_VOICE.value
    assert decision.risk_score >= 65.0


# ─────────────────────────────────────────────────────────────────────────────
# 5. Sensitive Intent Escalation: PAYMENT_TRANSFER
# ─────────────────────────────────────────────────────────────────────────────

def test_payment_request_intent_escalation(engine: RiskEngine):
    """
    Payment transfer intent escalates risk score.
    Even for enrolled speaker, financial transactions require monitoring / step-up auth.
    """
    decision_normal = engine.evaluate(
        speaker_similarity=0.85,
        speaker_match=True,
        synthetic_probability=0.08,
        intent="NORMAL_CONVERSATION",
    )
    decision_payment = engine.evaluate(
        speaker_similarity=0.85,
        speaker_match=True,
        synthetic_probability=0.08,
        intent="PAYMENT_TRANSFER",
        intent_confidence=0.95,
    )
    assert decision_payment.risk_score > decision_normal.risk_score
    assert decision_payment.risk_level in (RiskLevel.LOW.value, RiskLevel.MEDIUM.value)
    assert decision_payment.recommended_action in (
        RecommendedAction.MONITOR.value,
        RecommendedAction.REQUIRE_ADDITIONAL_VERIFICATION.value,
    )
    assert any("PAYMENT_TRANSFER" in r for r in decision_payment.reasons)


# ─────────────────────────────────────────────────────────────────────────────
# 6. Sensitive Intent Escalation: OTP_REQUEST
# ─────────────────────────────────────────────────────────────────────────────

def test_otp_request_intent_escalation(engine: RiskEngine):
    """
    OTP request from an unverified or imposter voice is extremely high risk.
    """
    decision = engine.evaluate(
        speaker_similarity=0.25,
        speaker_match=False,
        synthetic_probability=0.10,
        intent="OTP_REQUEST",
        intent_confidence=0.95,
    )
    assert decision.risk_score >= 65.0
    assert decision.risk_level in (RiskLevel.HIGH.value, RiskLevel.CRITICAL.value)
    assert decision.recommended_action in (
        RecommendedAction.REQUIRE_ADDITIONAL_VERIFICATION.value,
        RecommendedAction.BLOCK_OR_ESCALATE.value,
    )
    assert any("OTP_REQUEST" in r for r in decision.reasons)


# ─────────────────────────────────────────────────────────────────────────────
# 7. Sensitive Intent Escalation: CREDENTIAL_REQUEST
# ─────────────────────────────────────────────────────────────────────────────

def test_credential_request_intent_escalation(engine: RiskEngine):
    """
    Credential harvesting (asking for password/pin) elevates risk substantially.
    """
    decision = engine.evaluate(
        speaker_similarity=0.85,
        speaker_match=True,
        synthetic_probability=0.12,
        intent="CREDENTIAL_REQUEST",
        intent_confidence=0.90,
    )
    assert decision.risk_score >= 35.0
    assert decision.risk_level in (RiskLevel.LOW.value, RiskLevel.MEDIUM.value)
    assert any("CREDENTIAL_REQUEST" in r for r in decision.reasons)


# ─────────────────────────────────────────────────────────────────────────────
# 7b. Sensitive Intent Escalation: URGENT_REQUEST
# ─────────────────────────────────────────────────────────────────────────────

def test_urgent_request_intent_escalation(engine: RiskEngine):
    """
    Urgent pressure/distress tactics elevate baseline risk.
    """
    decision = engine.evaluate(
        speaker_similarity=0.85,
        speaker_match=True,
        synthetic_probability=0.10,
        intent="URGENT_REQUEST",
        intent_confidence=0.90,
    )
    assert decision.risk_score > 15.0
    assert any("URGENT_REQUEST" in r for r in decision.reasons)


# ─────────────────────────────────────────────────────────────────────────────
# 8. Normal Conversation Baseline
# ─────────────────────────────────────────────────────────────────────────────

def test_normal_conversation_baseline(engine: RiskEngine):
    """
    Benign conversation adds 0 intent risk points.
    """
    decision = engine.evaluate(
        speaker_similarity=0.85,
        speaker_match=True,
        synthetic_probability=0.05,
        intent="NORMAL_CONVERSATION",
        intent_confidence=0.8,
    )
    assert decision.breakdown["intent_component"] == 0.0
    assert decision.risk_level == RiskLevel.SAFE.value


# ─────────────────────────────────────────────────────────────────────────────
# 9. Configurable Threshold Overrides
# ─────────────────────────────────────────────────────────────────────────────

def test_configurable_threshold_overrides():
    """
    Customizing RiskEngineConfig must alter decision boundaries without code changes.
    """
    strict_config = RiskEngineConfig(
        synthetic_high_threshold=0.50,  # lower threshold for strict synthetic detection
        score_safe_max=15.0,            # stricter safe floor
    )
    strict_engine = RiskEngine(config=strict_config)

    # With prob=0.52 and match=True -> triggers AI_CLONE under strict config
    decision = strict_engine.evaluate(
        speaker_similarity=0.85,
        speaker_match=True,
        synthetic_probability=0.52,
        intent="NORMAL_CONVERSATION",
    )
    assert decision.scenario == SecurityScenario.AI_CLONE_ENROLLED_SPEAKER.value
    assert decision.risk_level == RiskLevel.CRITICAL.value


# ─────────────────────────────────────────────────────────────────────────────
# 10. Evaluation from Canonical InferenceResult
# ─────────────────────────────────────────────────────────────────────────────

def test_evaluate_inference_result(engine: RiskEngine):
    """
    evaluate_inference_result() seamlessly consumes an InferenceResult object.
    """
    inf_res = InferenceResult(
        session_id="test_sess_99",
        chunk_id="1",
        speech_detected=True,
        speaker_similarity=0.88,
        speaker_match=True,
        synthetic_probability=0.06,
        transcript="How are you doing?",
        intent="NORMAL_CONVERSATION",
        intent_confidence=0.8,
    )

    decision = engine.evaluate_inference_result(inf_res)
    assert isinstance(decision, RiskDecision)
    assert decision.risk_level == RiskLevel.SAFE.value
    assert decision.recommended_action == RecommendedAction.ALLOW.value
    assert decision.scenario == SecurityScenario.GENUINE_ENROLLED_SPEAKER.value
