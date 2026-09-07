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
    "identity_claim": [
        "i am",
        "this is",
        "my name is",
        "speaking",
        "calling from",
        "i'm calling from",
        "i represent",
        "i work for",
        "i am calling on behalf of",
        "from the bank",
        "from the police",
        "from the government",
        "from the company",
        "from headquarters",
        "from the finance department",
        "from the security department",
    ],

    "otp_request": [
        "otp",
        "one time password",
        "one-time password",
        "verification code",
        "verification number",
        "security code",
        "authentication code",
        "auth code",
        "six digit code",
        "six-digit code",
        "send me the code",
        "tell me the code",
        "read out the code",
        "share the otp",
        "give me the otp",
        "forward the otp",
    ],

    "credential_request": [
        "password",
        "passcode",
        "pin",
        "mpin",
        "m pin",
        "login details",
        "login credentials",
        "username and password",
        "user id and password",
        "account password",
        "atm pin",
        "debit card pin",
        "credit card pin",
        "cvv",
        "card security code",
    ],

    "kyc_request": [
        "kyc",
        "complete your kyc",
        "update your kyc",
        "kyc update",
        "kyc verification",
        "kyc documents",
        "kyc details",
        "kyc process",
        "verify your identity",
        "identity verification",
        "customer verification",
        "customer identification",
        "reverification",
        "re-kyc",
        "kyc has expired",
        "your kyc is pending",
        "your kyc has expired",
    ],

    "personal_data_request": [
        "aadhaar",
        "aadhar",
        "aadhaar number",
        "aadhar number",
        "pan",
        "pan number",
        "passport",
        "passport number",
        "driving license",
        "driving licence",
        "voter id",
        "voter id number",
        "date of birth",
        "dob",
        "full address",
        "home address",
        "residential address",
        "phone number",
        "mobile number",
        "email address",
        "personal details",
        "identity number",
        "government id",
        "id proof",
        "identity proof",
    ],

    "financial_request": [
        "transfer",
        "bank transfer",
        "wire transfer",
        "payment",
        "make a payment",
        "send money",
        "transfer money",
        "upi",
        "upi payment",
        "upi transfer",
        "neft",
        "rtgs",
        "imps",
        "bank account",
        "account number",
        "beneficiary",
        "beneficiary account",
        "fund transfer",
        "transaction",
        "rupees",
        "inr",
        "money",
        "funds",
        "pay",
        "deposit",
        "withdraw",
        "refund",
        "refund processing",
    ],

    "confidential_document_request": [
        "confidential document",
        "confidential documents",
        "confidential file",
        "confidential files",
        "internal document",
        "internal documents",
        "internal file",
        "internal files",
        "private document",
        "private files",
        "sensitive document",
        "sensitive files",
        "restricted document",
        "restricted file",
        "company document",
        "company files",
        "financial report",
        "financial statement",
        "audit report",
        "salary report",
        "employee records",
        "customer records",
        "customer database",
        "client information",
        "send me the document",
        "send me the file",
        "email me the file",
        "forward the document",
        "upload the document",
        "share the file",
        "share the report",
    ],

    "account_change_request": [
        "change my account",
        "update my account",
        "change the account number",
        "change phone number",
        "change mobile number",
        "change email",
        "update email",
        "change address",
        "update address",
        "reset my password",
        "reset password",
        "unlock my account",
        "unblock my account",
        "change beneficiary",
        "add beneficiary",
        "remove beneficiary",
        "change bank details",
        "update bank details",
    ],

    "access_request": [
        "give me access",
        "grant me access",
        "provide access",
        "share access",
        "login to",
        "log in to",
        "access the system",
        "access the account",
        "remote access",
        "screen sharing",
        "share your screen",
        "install this application",
        "install this app",
        "download this software",
        "allow remote access",
    ],

    "urgent_request": [
        "immediately",
        "right now",
        "urgent",
        "urgently",
        "emergency",
        "as soon as possible",
        "do this now",
        "don't delay",
        "time is running out",
        "before it's too late",
        "act immediately",
        "critical",
        "this cannot wait",
        "need this now",
    ],

    "secrecy_request": [
        "don't tell anyone",
        "do not tell anyone",
        "keep this secret",
        "keep this confidential",
        "don't inform anyone",
        "do not inform anyone",
        "don't tell your manager",
        "don't tell your family",
        "don't contact anyone",
        "don't discuss this",
        "keep this between us",
        "this is confidential",
        "don't mention this",
        "don't share this with anyone",
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
