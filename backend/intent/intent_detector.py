"""
backend/intent/intent_detector.py
=================================
Rule-based conversational intent detector for analyzing speech transcripts.

Supported Intents:
  - NORMAL_CONVERSATION
  - PAYMENT_TRANSFER
  - OTP_REQUEST
  - CREDENTIAL_REQUEST
  - URGENT_REQUEST
  - UNKNOWN

Returns:
  - intent: str
  - intent_confidence: float
  - matched_indicators: list[str]
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Pattern, Tuple, Union

from backend.utils.logger import get_logger

log = get_logger(__name__)


class IntentType(str, Enum):
    """Canonical supported intent categories."""
    NORMAL_CONVERSATION = "NORMAL_CONVERSATION"
    PAYMENT_TRANSFER    = "PAYMENT_TRANSFER"
    OTP_REQUEST         = "OTP_REQUEST"
    CREDENTIAL_REQUEST  = "CREDENTIAL_REQUEST"
    URGENT_REQUEST      = "URGENT_REQUEST"
    UNKNOWN             = "UNKNOWN"


@dataclass(frozen=True)
class IntentResult:
    """
    Structured outcome of the intent detection stage.

    Attributes
    ----------
    intent : str
        One of IntentType values (e.g. 'PAYMENT_TRANSFER', 'OTP_REQUEST', etc.).
    intent_confidence : float
        Confidence score between 0.0 and 1.0.
    matched_indicators : List[str]
        Specific keywords or phrases that triggered the decision.
    all_scores : Dict[str, float]
        Individual scores across all evaluated intents.
    """
    intent: str
    intent_confidence: float
    matched_indicators: List[str] = field(default_factory=list)
    all_scores: Dict[str, float] = field(default_factory=dict)

    # Schema compatibility aliases
    @property
    def confidence(self) -> float:
        return self.intent_confidence

    @property
    def keywords_matched(self) -> List[str]:
        return self.matched_indicators

    def summary(self) -> str:
        indicators = ", ".join(self.matched_indicators) if self.matched_indicators else "none"
        return f"[INTENT] {self.intent} (conf={self.intent_confidence:.2f}) | matches: [{indicators}]"


@dataclass
class IntentRule:
    """A rule pattern and its associated weight and priority."""
    pattern: Union[str, Pattern]
    indicator_label: str
    weight: float = 1.0


class IntentDetector:
    """
    Transparent, modular, rule-based intent analyzer for speech transcripts.
    """

    # Priority hierarchy for resolving overlapping intents:
    # Compromise of security tokens & credentials > Financial transfers > Urgency > Normal
    INTENT_PRIORITY: List[IntentType] = [
        IntentType.OTP_REQUEST,
        IntentType.CREDENTIAL_REQUEST,
        IntentType.PAYMENT_TRANSFER,
        IntentType.URGENT_REQUEST,
        IntentType.NORMAL_CONVERSATION,
    ]

    def __init__(self, custom_rules: Optional[Dict[IntentType, List[IntentRule]]] = None) -> None:
        """Initialize detector with standard or custom rule definitions."""
        self._rules = custom_rules or self._build_default_rules()
        log.debug("IntentDetector initialized with %d intent categories", len(self._rules))

    @staticmethod
    def _build_default_rules() -> Dict[IntentType, List[IntentRule]]:
        """Construct modular regex and phrase rules for each intent category."""
        return {
            IntentType.OTP_REQUEST: [
                IntentRule(r"\b(?:otp|one[- ]time[- ]password|verification[- ]code|auth[- ]code|sms[- ]code)\b", "otp_keyword", 1.5),
                IntentRule(r"\b(?:send|give|share|tell|forward|provide|enter|read)\b.*\b(?:otp|one[- ]time[- ]password|verification[- ]code|auth[- ]code|passcode)\b", "request_otp_action", 1.5),
                IntentRule(r"\b(?:what is|what's)\b.*\b(?:the otp|your otp|the code|one[- ]time[- ]password)\b", "ask_otp_phrase", 1.2),
                IntentRule(r"\b(?:received|just sent)\b.*\b(?:otp|code|one[- ]time[- ]password)\b", "received_otp_action", 1.0),
            ],
            IntentType.CREDENTIAL_REQUEST: [
                IntentRule(r"(?<!one-time\s)(?<!one\stime\s)\b(?:password|passwd|passcode|secret[- ]pin|atm[- ]pin|cvv|cvc)\b", "credential_keyword", 1.0),
                IntentRule(r"\b(?:tell|share|give|send|provide|what(?:'s| is))\b.*?(?<!one-time\s)(?<!one\stime\s)\b(?:your|the)?\s*(?:password|pin|credentials|cvv)\b", "request_credential_action", 1.2),
                IntentRule(r"\b(?:login|banking|account)\b.*\b(?:credentials|password|details|login info)\b", "banking_credentials_phrase", 1.1),
                IntentRule(r"\b(?:credit[- ]card|debit[- ]card)\b.*\b(?:number|details|expiry|cvv)\b", "card_details_phrase", 1.1),
            ],
            IntentType.PAYMENT_TRANSFER: [
                IntentRule(r"\b(?:transfer|send|wire|deposit|remit|pay)\b.*\b(?:money|funds?|rupees|rs\.?|dollars|\$|cash|amount)\b", "transfer_money_action", 1.2),
                IntentRule(r"\b(?:transfer|send|pay)\b.*\b(?:\d+|twenty|thirty|forty|fifty|hundred|thousand|lakh|crore)\b", "transfer_amount_action", 1.2),
                IntentRule(r"\b(?:bank[- ]account|upi[- ]id|upi|wallet|beneficiary|account[- ]number|gpay|phonepe|paytm|neft|rtgs|imps)\b", "payment_rail_keyword", 0.9),
                IntentRule(r"\b(?:payment[- ]transfer|money[- ]transfer|wire[- ]transfer|quick[- ]pay)\b", "payment_action_compound", 1.1),
                IntentRule(r"\b(?:transfer|payment)\b", "payment_term", 0.8),
            ],
            IntentType.URGENT_REQUEST: [
                IntentRule(r"\b(?:immediately|right now|urgently|emergency|asap|urgent|at once|without delay)\b", "urgency_adverb", 1.0),
                IntentRule(r"\b(?:hurry up|fast|in a rush|crucial|critical time)\b", "urgency_phrase", 0.9),
                IntentRule(r"\b(?:do (?:it|this)|act)\b.*\b(?:now|immediately|fast|urgently)\b", "urgent_action_command", 1.1),
                IntentRule(r"\b(?:matter of life and death|serious trouble|hospital emergency|accident)\b", "crisis_phrase", 1.2),
            ],
            IntentType.NORMAL_CONVERSATION: [
                IntentRule(r"\b(?:how are you|how was your day|good morning|good evening|hello|hi|hey|thanks|thank you|see you|catch up|talk to you later)\b", "conversational_greeting", 0.6),
                IntentRule(r"\b(?:weather|weekend|lunch|dinner|coffee|meeting|movie|game|work|reading|travel)\b", "casual_topic", 0.5),
            ],
        }

    def normalize_text(self, text: str) -> str:
        """Standardize text for robust matching: lowercased, normalized spaces."""
        if not text:
            return ""
        # Lowercase
        normalized = text.lower().strip()
        # Normalize punctuation to spaces except hyphens inside compound words
        normalized = re.sub(r"[^\w\s-]", " ", normalized)
        # Collapse multiple spaces
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return normalized

    def detect(self, transcript: Union[str, Any]) -> IntentResult:
        """
        Analyze transcript text and detect the conversational intent.

        Parameters
        ----------
        transcript : str
            Text transcript produced by Whisper or speech recognizer.

        Returns
        -------
        IntentResult
            Detected intent, confidence, matched indicators, and breakdown.
        """
        if transcript is None:
            return IntentResult(
                intent=IntentType.UNKNOWN.value,
                intent_confidence=0.0,
                matched_indicators=[],
                all_scores={},
            )

        raw_text = str(transcript).strip()
        if not raw_text:
            return IntentResult(
                intent=IntentType.UNKNOWN.value,
                intent_confidence=0.0,
                matched_indicators=[],
                all_scores={},
            )

        norm_text = self.normalize_text(raw_text)
        if not norm_text or not any(c.isalnum() for c in norm_text):
            return IntentResult(
                intent=IntentType.UNKNOWN.value,
                intent_confidence=0.0,
                matched_indicators=[],
                all_scores={},
            )

        intent_matches: Dict[IntentType, List[str]] = {}
        intent_scores: Dict[IntentType, float] = {}

        # Evaluate rules across all categories
        for intent_type, rules in self._rules.items():
            matches = []
            score = 0.0
            for rule in rules:
                pattern = rule.pattern
                if isinstance(pattern, str):
                    found = re.findall(pattern, norm_text, flags=re.IGNORECASE)
                else:
                    found = pattern.findall(norm_text)

                if found:
                    matches.append(rule.indicator_label)
                    score += rule.weight * len(found)

            if matches:
                intent_matches[intent_type] = matches
                intent_scores[intent_type] = score

        # Check for non-benign (sensitive/urgent) matches
        sensitive_candidates = [
            intent for intent in self.INTENT_PRIORITY
            if intent in intent_scores and intent != IntentType.NORMAL_CONVERSATION
        ]

        if sensitive_candidates:
            # Overlapping intents: select the highest priority or highest scoring sensitive candidate
            # If multiple sensitive intents match, pick the one with highest score,
            # using INTENT_PRIORITY order as tie-breaker.
            best_intent = max(
                sensitive_candidates,
                key=lambda it: (intent_scores[it], -self.INTENT_PRIORITY.index(it)),
            )

            raw_score = intent_scores[best_intent]
            # Normalize confidence asymptotically: 1.0 - exp(-score) or min capped
            confidence = min(0.95, max(0.65, 0.5 + (raw_score * 0.15)))
            indicators = intent_matches[best_intent]

            log.info("Detected sensitive intent: %s (conf=%.2f, matches=%s)", best_intent.value, confidence, indicators)
            return IntentResult(
                intent=best_intent.value,
                intent_confidence=confidence,
                matched_indicators=indicators,
                all_scores={k.value: round(v, 2) for k, v in intent_scores.items()},
            )

        # No sensitive intent matched:
        # Check if conversation is a normal benign conversation
        # Text has words, no suspicious indicators -> NORMAL_CONVERSATION
        normal_indicators = intent_matches.get(IntentType.NORMAL_CONVERSATION, ["benign_dialogue"])
        normal_score = intent_scores.get(IntentType.NORMAL_CONVERSATION, 1.0)
        confidence = min(0.90, max(0.70, 0.60 + (normal_score * 0.1)))

        log.debug("Classified as normal conversation: '%s' (conf=%.2f)", raw_text[:40], confidence)
        return IntentResult(
            intent=IntentType.NORMAL_CONVERSATION.value,
            intent_confidence=confidence,
            matched_indicators=normal_indicators,
            all_scores={IntentType.NORMAL_CONVERSATION.value: round(normal_score, 2)},
        )
