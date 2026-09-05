"""
intent/detector.py
-------------------
Responsibility: Simple keyword/rule-based intent detection on transcript text.
                Intentionally lightweight — no ML model required.

Intents (initial set, expandable):
  - "verify_identity"  : caller claims to be a specific person
  - "financial_request": mentions money transfer, payment, OTP, etc.
  - "emergency"        : distress keywords
  - "unknown"          : no recognised intent

Pipeline stage: faster-whisper → intent detection → IntentResult

NOT IMPLEMENTED YET — skeleton only.
"""

from __future__ import annotations

from backend.schemas.inference_result import IntentResult


# ---------------------------------------------------------------------------
# Keyword maps (extend freely; no ML training needed)
# ---------------------------------------------------------------------------

INTENT_KEYWORDS: dict[str, list[str]] = {
    "verify_identity": [
        "i am", "this is", "my name is", "speaking", "calling from",
    ],
    "financial_request": [
        "transfer", "payment", "otp", "account", "upi", "bank",
        "money", "fund", "rupees", "transaction",
    ],
    "emergency": [
        "help", "urgent", "emergency", "danger", "accident", "police",
    ],
}


class IntentDetector:
    """
    Rule-based intent detector that scans transcript text for known keywords.

    Usage (future):
        detector = IntentDetector()
        result   = detector.detect("Please transfer 5000 to my account")
    """

    def __init__(self, keywords: dict[str, list[str]] | None = None) -> None:
        """
        Args:
            keywords: Optional custom keyword map. Defaults to INTENT_KEYWORDS.
        """
        self._keywords = keywords or INTENT_KEYWORDS

    def detect(self, text: str) -> IntentResult:
        """
        Detect the dominant intent in `text`.

        Args:
            text: Transcribed speech text (lowercased internally).

        Returns:
            IntentResult with the detected intent, confidence, and matched keywords.

        TODO: Implement keyword scanning; rank by match count;
              return highest-scoring intent.
        """
        raise NotImplementedError("IntentDetector.detect() is not yet implemented.")
