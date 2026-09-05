"""
backend/pipeline/risk_engine.py
===============================
Security Decision and Risk Assessment Engine for VoiceCloneDetection-SIH.

Combines:
  1. speaker_similarity & speaker_match (Biometric consistency)
  2. synthetic_probability (Acoustic deepfake/clone indicator)
  3. intent & intent_confidence (Conversational/social engineering context)

Distinguishes:
  A. Genuine enrolled speaker (High similarity, low synthetic prob, normal intent -> SAFE)
  B. Different genuine speaker (Low similarity, low synthetic prob -> SUSPICIOUS / VERIFY_SPEAKER)
  C. AI clone of enrolled speaker (High similarity, high synthetic prob -> CRITICAL / BLOCK_OR_ESCALATE)
  D. Unknown AI voice (Low similarity, high synthetic prob -> HIGH / BLOCK_OR_ESCALATE)

Key Security Invariants:
  - Speaker similarity alone NEVER proves identity (an AI clone replicates similarity).
  - Synthetic probability represents acoustic synthesis likelihood, not model confidence.
  - All thresholds are fully configurable via RiskEngineConfig (no magic numbers).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Union

from backend.schemas.inference_result import InferenceResult
from backend.utils.logger import get_logger

log = get_logger(__name__)


class RiskLevel(str, Enum):
    """Categorical risk assessment tiers."""
    SAFE     = "SAFE"
    LOW      = "LOW"
    MEDIUM   = "MEDIUM"
    HIGH     = "HIGH"
    CRITICAL = "CRITICAL"


class RecommendedAction(str, Enum):
    """Operational security response actions."""
    ALLOW                           = "ALLOW"
    MONITOR                         = "MONITOR"
    VERIFY_SPEAKER                  = "VERIFY_SPEAKER"
    REQUIRE_ADDITIONAL_VERIFICATION = "REQUIRE_ADDITIONAL_VERIFICATION"
    BLOCK_OR_ESCALATE               = "BLOCK_OR_ESCALATE"


class SecurityScenario(str, Enum):
    """Identified voice security scenario classification."""
    GENUINE_ENROLLED_SPEAKER  = "GENUINE_ENROLLED_SPEAKER"
    DIFFERENT_GENUINE_SPEAKER = "DIFFERENT_GENUINE_SPEAKER"
    AI_CLONE_ENROLLED_SPEAKER = "AI_CLONE_ENROLLED_SPEAKER"
    UNKNOWN_AI_VOICE          = "UNKNOWN_AI_VOICE"
    UNENROLLED_NATURAL_SPEAKER= "UNENROLLED_NATURAL_SPEAKER"
    NON_SPEECH_OR_INCONCLUSIVE= "NON_SPEECH_OR_INCONCLUSIVE"


@dataclass
class RiskEngineConfig:
    """Configurable risk scoring thresholds and component weights."""
    # Acoustic synthetic thresholds
    synthetic_high_threshold: float = 0.60
    synthetic_low_threshold: float = 0.35

    # Speaker biometric similarity thresholds
    speaker_similarity_high_threshold: float = 0.70
    speaker_similarity_low_threshold: float = 0.50

    # Risk level score boundaries (0.0 to 100.0)
    score_safe_max: float = 25.0
    score_low_max: float = 45.0
    score_medium_max: float = 65.0
    score_high_max: float = 85.0

    # Intent threat base points
    intent_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "CREDENTIAL_REQUEST": 40.0,
            "OTP_REQUEST": 40.0,
            "PAYMENT_TRANSFER": 30.0,
            "URGENT_REQUEST": 20.0,
            "NORMAL_CONVERSATION": 0.0,
            "UNKNOWN": 5.0,
        }
    )

    # Base risk points for acoustic synthetic presence
    base_synthetic_risk_max: float = 50.0
    # Additional penalty when high similarity accompanies high synthetic probability (Voice Cloning)
    clone_impersonation_penalty: float = 25.0

    # Base risk points for speaker mismatch (imposter)
    speaker_mismatch_penalty: float = 50.0


@dataclass(frozen=True)
class RiskDecision:
    """
    Structured outcome of the risk engine evaluation.

    Attributes
    ----------
    risk_score : float
        Synthesized risk score [0.0, 100.0]. Higher implies greater danger.
    risk_level : str
        SAFE, LOW, MEDIUM, HIGH, or CRITICAL.
    reasons : List[str]
        Clear explanation and audit trail justifying the risk calculation.
    recommended_action : str
        ALLOW, MONITOR, VERIFY_SPEAKER, REQUIRE_ADDITIONAL_VERIFICATION, or BLOCK_OR_ESCALATE.
    scenario : str
        Identified security scenario (e.g. AI_CLONE_ENROLLED_SPEAKER).
    breakdown : Dict[str, float]
        Contribution breakdown across synthetic, speaker, and intent dimensions.
    """
    risk_score: float
    risk_level: str
    reasons: List[str]
    recommended_action: str
    scenario: str
    breakdown: Dict[str, float] = field(default_factory=dict)

    def summary(self) -> str:
        return (
            f"[{self.risk_level}] score={self.risk_score:.1f} | action={self.recommended_action} | "
            f"scenario={self.scenario} | reasons={self.reasons}"
        )


class RiskEngine:
    """
    Transparent, rule-based security decision engine.
    """

    def __init__(self, config: Optional[RiskEngineConfig] = None) -> None:
        self.config = config or RiskEngineConfig()

    def evaluate(
        self,
        speaker_similarity: Optional[float],
        speaker_match: Optional[bool],
        synthetic_probability: Optional[float],
        intent: str = "NORMAL_CONVERSATION",
        intent_confidence: float = 0.0,
    ) -> RiskDecision:
        """
        Evaluate risk across biometric, synthetic, and conversational dimensions.

        Parameters
        ----------
        speaker_similarity : float | None
            Cosine similarity score [0.0, 1.0] from ECAPA-TDNN verifier.
        speaker_match : bool | None
            Boolean verdict from ECAPA-TDNN verifier.
        synthetic_probability : float | None
            Probability [0.0, 1.0] that speech is synthetic.
        intent : str
            Detected conversational intent category.
        intent_confidence : float
            Confidence of the intent detection [0.0, 1.0].

        Returns
        -------
        RiskDecision
        """
        reasons: List[str] = []
        breakdown: Dict[str, float] = {
            "synthetic_component": 0.0,
            "speaker_component": 0.0,
            "intent_component": 0.0,
        }

        cfg = self.config
        norm_intent = str(intent).upper().strip()

        # Handle non-speech or missing inputs
        if synthetic_probability is None and speaker_similarity is None:
            reasons.append("No speech or acoustic metrics available.")
            return RiskDecision(
                risk_score=0.0,
                risk_level=RiskLevel.SAFE.value,
                reasons=reasons,
                recommended_action=RecommendedAction.ALLOW.value,
                scenario=SecurityScenario.NON_SPEECH_OR_INCONCLUSIVE.value,
                breakdown=breakdown,
            )

        synth_prob = float(synthetic_probability if synthetic_probability is not None else 0.0)
        is_synth_high = synth_prob >= cfg.synthetic_high_threshold
        is_synth_low = synth_prob < cfg.synthetic_low_threshold

        has_speaker_ref = speaker_similarity is not None
        spk_sim = float(speaker_similarity if speaker_similarity is not None else 0.0)
        is_spk_match = (
            speaker_match if speaker_match is not None
            else (spk_sim >= cfg.speaker_similarity_high_threshold if has_speaker_ref else False)
        )
        is_spk_low = (spk_sim < cfg.speaker_similarity_low_threshold) if has_speaker_ref else False

        # ── 1. Scenario Identification ───────────────────────────────────────
        if has_speaker_ref:
            if is_synth_high and is_spk_match:
                scenario = SecurityScenario.AI_CLONE_ENROLLED_SPEAKER
                reasons.append(
                    f"CRITICAL: High speaker match (similarity={spk_sim:.2f}) combined with high "
                    f"synthetic probability ({synth_prob:.2f}) indicates an AI clone of enrolled speaker."
                )
            elif is_synth_high and not is_spk_match:
                scenario = SecurityScenario.UNKNOWN_AI_VOICE
                reasons.append(
                    f"HIGH RISK: High synthetic speech probability ({synth_prob:.2f}) detected from an "
                    f"unknown voice (similarity={spk_sim:.2f})."
                )
            elif not is_synth_high and is_spk_low:
                scenario = SecurityScenario.DIFFERENT_GENUINE_SPEAKER
                reasons.append(
                    f"SUSPICIOUS: Speaker verification mismatch (similarity={spk_sim:.2f} < threshold). "
                    f"Voice does not match enrolled reference speaker."
                )
            elif is_synth_low and is_spk_match:
                scenario = SecurityScenario.GENUINE_ENROLLED_SPEAKER
                reasons.append(
                    f"VERIFIED: Enrolled speaker verified (similarity={spk_sim:.2f}) with natural "
                    f"speech acoustics (synthetic_prob={synth_prob:.2f})."
                )
            else:
                # Borderline synthetic or speaker similarity
                scenario = SecurityScenario.DIFFERENT_GENUINE_SPEAKER
                reasons.append(
                    f"EVALUATING: Inconclusive acoustic match (similarity={spk_sim:.2f}, synthetic_prob={synth_prob:.2f})."
                )
        else:
            if is_synth_high:
                scenario = SecurityScenario.UNKNOWN_AI_VOICE
                reasons.append(
                    f"HIGH RISK: High synthetic probability ({synth_prob:.2f}) without enrolled reference speaker."
                )
            else:
                scenario = SecurityScenario.UNENROLLED_NATURAL_SPEAKER
                reasons.append(
                    f"UNENROLLED: Natural speech detected (synthetic_prob={synth_prob:.2f}), but no reference speaker enrolled."
                )

        # ── 2. Component Scoring ─────────────────────────────────────────────
        # A. Synthetic Component
        # Quadratic scaling to aggressively penalize high synthetic probability
        synthetic_score = (synth_prob ** 1.5) * cfg.base_synthetic_risk_max
        if scenario == SecurityScenario.AI_CLONE_ENROLLED_SPEAKER:
            # Add clone impersonation penalty
            synthetic_score += cfg.clone_impersonation_penalty
        breakdown["synthetic_component"] = round(synthetic_score, 2)

        # B. Speaker Component
        speaker_score = 0.0
        if has_speaker_ref:
            if not is_spk_match or is_spk_low:
                # Speaker mismatch penalty
                speaker_score = cfg.speaker_mismatch_penalty
            else:
                # Genuine match: 0 risk points from speaker verification
                speaker_score = 0.0
        else:
            # Missing reference speaker introduces baseline uncertainty
            speaker_score = 10.0
        breakdown["speaker_component"] = round(speaker_score, 2)

        # C. Intent Threat Component
        intent_base = cfg.intent_weights.get(norm_intent, 10.0)
        # Scale intent threat by intent confidence
        conf_factor = min(1.0, max(0.5, intent_confidence))
        intent_score = intent_base * conf_factor
        if intent_base > 0.0:
            reasons.append(f"Sensitive intent detected: '{norm_intent}' (+{intent_score:.1f} risk points).")
        breakdown["intent_component"] = round(intent_score, 2)

        # ── 3. Total Score and Level Mapping ──────────────────────────────────
        total_score = min(100.0, max(0.0, synthetic_score + speaker_score + intent_score))

        # Enforce hard security floors for critical/suspicious scenarios:
        # 1. AI Clone of enrolled speaker must ALWAYS be at least CRITICAL
        if scenario == SecurityScenario.AI_CLONE_ENROLLED_SPEAKER:
            total_score = max(total_score, cfg.score_high_max + 1.0)
        # 2. Unknown AI voice must ALWAYS be at least HIGH
        elif scenario == SecurityScenario.UNKNOWN_AI_VOICE:
            total_score = max(total_score, cfg.score_medium_max + 1.0)
        # 3. Different genuine speaker must ALWAYS be at least MEDIUM (SUSPICIOUS)
        elif scenario == SecurityScenario.DIFFERENT_GENUINE_SPEAKER:
            total_score = max(total_score, cfg.score_low_max + 1.0)

        # Map to RiskLevel
        if total_score < cfg.score_safe_max:
            risk_level = RiskLevel.SAFE
        elif total_score < cfg.score_low_max:
            risk_level = RiskLevel.LOW
        elif total_score < cfg.score_medium_max:
            risk_level = RiskLevel.MEDIUM
        elif total_score < cfg.score_high_max:
            risk_level = RiskLevel.HIGH
        else:
            risk_level = RiskLevel.CRITICAL

        # ── 4. Recommended Action Decision ────────────────────────────────────
        if risk_level == RiskLevel.CRITICAL:
            recommended_action = RecommendedAction.BLOCK_OR_ESCALATE
        elif risk_level == RiskLevel.HIGH:
            if scenario in (SecurityScenario.UNKNOWN_AI_VOICE, SecurityScenario.AI_CLONE_ENROLLED_SPEAKER):
                recommended_action = RecommendedAction.BLOCK_OR_ESCALATE
            else:
                recommended_action = RecommendedAction.REQUIRE_ADDITIONAL_VERIFICATION
        elif risk_level == RiskLevel.MEDIUM:
            if scenario == SecurityScenario.DIFFERENT_GENUINE_SPEAKER:
                recommended_action = RecommendedAction.VERIFY_SPEAKER
            else:
                recommended_action = RecommendedAction.REQUIRE_ADDITIONAL_VERIFICATION
        elif risk_level == RiskLevel.LOW:
            recommended_action = RecommendedAction.MONITOR
        else:
            recommended_action = RecommendedAction.ALLOW

        return RiskDecision(
            risk_score=round(total_score, 1),
            risk_level=risk_level.value,
            reasons=reasons,
            recommended_action=recommended_action.value,
            scenario=scenario.value,
            breakdown=breakdown,
        )

    def evaluate_inference_result(self, result: InferenceResult) -> RiskDecision:
        """Convenience method to evaluate directly from a canonical InferenceResult."""
        return self.evaluate(
            speaker_similarity=result.speaker_similarity,
            speaker_match=result.speaker_match,
            synthetic_probability=result.synthetic_probability,
            intent=result.intent,
            intent_confidence=result.intent_confidence,
        )
