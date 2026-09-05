"""
backend/tests/test_intent_detector.py
=====================================
Unit test suite for the rule-based IntentDetector (backend/intent/intent_detector.py).

Verifies:
  1. NORMAL_CONVERSATION classification (greetings, casual chat, benign speech)
  2. PAYMENT_TRANSFER classification (transfers, rupees, funds, bank/UPI rails)
  3. OTP_REQUEST classification (OTP, one-time passwords, verification codes)
  4. CREDENTIAL_REQUEST classification (passwords, PINs, card details)
  5. URGENT_REQUEST classification (urgency, emergency, immediately, right now)
  6. Overlapping intents resolution based on threat priority
  7. UNKNOWN classification for empty, whitespace, and punctuation-only inputs
  8. Case-insensitivity and phrasing robustness
  9. Result schema contract, properties, and summary() formatting
"""

from __future__ import annotations

import pytest

from backend.intent.intent_detector import IntentDetector, IntentResult, IntentType


@pytest.fixture
def detector() -> IntentDetector:
    return IntentDetector()


# ─────────────────────────────────────────────────────────────────────────────
# 1. Normal Conversation Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "text",
    [
        "How was your day?",
        "Good morning, how are you doing today?",
        "Hey, let's grab lunch and talk about the project later.",
        "The weather is really pleasant this evening.",
        "Thanks for the update, see you tomorrow.",
        "I was reading an interesting article on deep learning.",
    ],
)
def test_normal_conversation(detector: IntentDetector, text: str):
    res: IntentResult = detector.detect(text)
    assert res.intent == IntentType.NORMAL_CONVERSATION.value
    assert 0.60 <= res.intent_confidence <= 1.0
    assert len(res.matched_indicators) > 0


# ─────────────────────────────────────────────────────────────────────────────
# 2. Payment Transfer Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "text",
    [
        "Please transfer twenty thousand rupees immediately",
        "Can you send five thousand rupees to my bank account?",
        "Transfer the funds to my UPI ID right away.",
        "Please wire the money to this beneficiary account number.",
        "I need you to remit the cash payment today.",
    ],
)
def test_payment_transfer(detector: IntentDetector, text: str):
    res: IntentResult = detector.detect(text)
    assert res.intent == IntentType.PAYMENT_TRANSFER.value
    assert res.intent_confidence >= 0.65
    assert len(res.matched_indicators) > 0


# ─────────────────────────────────────────────────────────────────────────────
# 3. OTP Request Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "text",
    [
        "Send me the OTP",
        "Tell me the one time password you received on your phone.",
        "Can you share the verification code sent to your mobile?",
        "What is the six digit auth code you just got via SMS?",
        "Please provide the OTP to confirm your request.",
    ],
)
def test_otp_request(detector: IntentDetector, text: str):
    res: IntentResult = detector.detect(text)
    assert res.intent == IntentType.OTP_REQUEST.value
    assert res.intent_confidence >= 0.65
    assert len(res.matched_indicators) > 0


# ─────────────────────────────────────────────────────────────────────────────
# 4. Credential Request Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "text",
    [
        "Tell me your password",
        "Share your secret PIN so I can unlock the account.",
        "What is your ATM PIN and banking password?",
        "I need your credit card number and the CVV on the back.",
        "Please provide your login credentials to continue.",
    ],
)
def test_credential_request(detector: IntentDetector, text: str):
    res: IntentResult = detector.detect(text)
    assert res.intent == IntentType.CREDENTIAL_REQUEST.value
    assert res.intent_confidence >= 0.65
    assert len(res.matched_indicators) > 0


# ─────────────────────────────────────────────────────────────────────────────
# 5. Urgent Request Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "text",
    [
        "Do it right now, this is extremely urgent",
        "Act immediately without delay, we have an emergency.",
        "Hurry up, this is a matter of life and death!",
        "Please respond at once, it is critical time.",
        "This is an emergency, we need help right now.",
    ],
)
def test_urgent_request(detector: IntentDetector, text: str):
    res: IntentResult = detector.detect(text)
    assert res.intent == IntentType.URGENT_REQUEST.value
    assert res.intent_confidence >= 0.65
    assert len(res.matched_indicators) > 0


# ─────────────────────────────────────────────────────────────────────────────
# 6. Overlapping Intents & Threat Hierarchy
# ─────────────────────────────────────────────────────────────────────────────

def test_overlapping_payment_and_urgency(detector: IntentDetector):
    """
    When payment and urgency co-occur, payment is the primary sensitive intent.
    Example: 'Please transfer twenty thousand rupees immediately'
    """
    text = "Please transfer twenty thousand rupees immediately"
    res = detector.detect(text)
    assert res.intent == IntentType.PAYMENT_TRANSFER.value


def test_overlapping_otp_and_urgency(detector: IntentDetector):
    """
    When OTP request and urgency co-occur, OTP is the primary sensitive intent.
    """
    text = "Send me your OTP right now, it is an emergency!"
    res = detector.detect(text)
    assert res.intent == IntentType.OTP_REQUEST.value


def test_overlapping_credentials_and_urgency(detector: IntentDetector):
    """
    When credential request and urgency co-occur, credential request dominates.
    """
    text = "Tell me your password immediately, urgent system lock!"
    res = detector.detect(text)
    assert res.intent == IntentType.CREDENTIAL_REQUEST.value


def test_overlapping_otp_and_payment(detector: IntentDetector):
    """
    When OTP is requested to authorize payment, security credential compromise is top priority.
    """
    text = "Give me the OTP to complete the money transfer."
    res = detector.detect(text)
    assert res.intent == IntentType.OTP_REQUEST.value


# ─────────────────────────────────────────────────────────────────────────────
# 7. Empty, Whitespace, Punctuation-Only (UNKNOWN)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "empty_input",
    [
        "",
        "   ",
        "\t\n",
        "...",
        "???",
        "---",
        None,
    ],
)
def test_empty_and_unknown_inputs(detector: IntentDetector, empty_input):
    res = detector.detect(empty_input)
    assert res.intent == IntentType.UNKNOWN.value
    assert res.intent_confidence == 0.0
    assert res.matched_indicators == []


# ─────────────────────────────────────────────────────────────────────────────
# 8. Case-Insensitivity & Normalization Robustness
# ─────────────────────────────────────────────────────────────────────────────

def test_case_insensitivity(detector: IntentDetector):
    res_upper = detector.detect("SEND ME THE OTP NOW")
    res_mixed = detector.detect("sEnD mE tHe OtP nOw")
    assert res_upper.intent == IntentType.OTP_REQUEST.value
    assert res_mixed.intent == IntentType.OTP_REQUEST.value


def test_punctuation_normalization(detector: IntentDetector):
    res = detector.detect("Please... transfer, twenty-thousand rupees! Immediately?!")
    assert res.intent == IntentType.PAYMENT_TRANSFER.value


# ─────────────────────────────────────────────────────────────────────────────
# 9. Result Contract & Summary
# ─────────────────────────────────────────────────────────────────────────────

def test_intent_result_contract(detector: IntentDetector):
    res = detector.detect("Tell me your password")
    assert isinstance(res, IntentResult)
    assert res.intent == IntentType.CREDENTIAL_REQUEST.value
    assert res.confidence == res.intent_confidence
    assert res.keywords_matched == res.matched_indicators
    assert "credential_keyword" in res.matched_indicators or "request_credential_action" in res.matched_indicators

    summary = res.summary()
    assert "[INTENT]" in summary
    assert "CREDENTIAL_REQUEST" in summary
    assert "conf=" in summary
