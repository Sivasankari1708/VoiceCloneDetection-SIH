/**
 * VoiceShield Sensitive Data & OTP Solicitation Detection Engine
 * 
 * Accurately identifies when a caller or party requests OTPs, passwords,
 * banking credentials, or personal identification data.
 */

export interface SensitiveDetectionResult {
  isSensitive: boolean;
  category: 'OTP' | 'Bank Credentials' | 'Account Password' | 'Identity Document' | 'Payment Transfer' | 'None';
  severity: 'Critical' | 'High' | 'Safe';
  matchedKeyword: string | null;
  warningLabel: string;
  recommendedAction: string;
}

// 1. High-priority OTP patterns (Always Critical)
const OTP_REGEX = /\b(?:otp|one[- ]?time[- ]?password|verification[- ]?code|auth[- ]?code|sms[- ]?code|security[- ]?code|passcode|secret[- ]?code|login[- ]?code|access[- ]?code|6[- ]?digit[- ]?code|4[- ]?digit[- ]?code|digits? sent to (?:your|the) (?:phone|mobile|sms))\b/i;

const OTP_ACTION_REGEX = /\b(?:send|give|share|tell|forward|provide|enter|read|confirm|verify|check)\b.*?\b(?:otp|code|password|digits?)\b/i;

// 2. Banking & Financial Credentials (Always Critical)
const BANK_CREDENTIAL_REGEX = /\b(?:cvv|cvv2|atm[- ]?pin|mpin|upi[- ]?pin|transaction[- ]?pin|card[- ]?pin|pin[- ]?number|card[- ]?number|debit[- ]?card|credit[- ]?card|expiry[- ]?date|net[- ]?banking password|bank[- ]?account number)\b/i;

// 3. Account Passwords & Master Keys (Always Critical)
const PASSWORD_REGEX = /\b(?:password|passphrase|login credentials?|portal credentials?|master key|secret answer)\b/i;

// 4. Identity Documents & KYC Threat (High / Critical)
const IDENTITY_KYC_REGEX = /\b(?:aadhaar(?:[- ]?card|[- ]?number)?|pan(?:[- ]?card|[- ]?number)?|kyc[- ]?update|kyc[- ]?verification|account (?:suspended|blocked|frozen)|biometric data)\b/i;

// 5. Urgent Financial Transfers & Coercion (High)
const URGENT_FINANCIAL_REGEX = /\b(?:wire[- ]?transfer|immediate payment|transfer (?:money|funds|amount)|send money|urgent clearance|crypto|gift[- ]?card)\b/i;

/**
 * Analyzes conversational text to determine if sensitive information or OTP is being solicited.
 */
export function analyzeSensitiveSolicitation(text: string, speaker: 'caller' | 'employee' = 'caller'): SensitiveDetectionResult {
  if (!text || typeof text !== 'string') {
    return {
      isSensitive: false,
      category: 'None',
      severity: 'Safe',
      matchedKeyword: null,
      warningLabel: 'Normal conversation',
      recommendedAction: 'Continue normal call workflow.',
    };
  }

  const cleanText = text.trim();

  // If employee is disclosing digits/OTP after request
  if (speaker === 'employee') {
    if (
      /\b\d{4,8}\b/.test(cleanText) ||
      /(?:zero|one|two|three|four|five|six|seven|eight|nine)\s+(?:zero|one|two|three|four|five|six|seven|eight|nine)/i.test(cleanText) ||
      /otp is|code is|pin is|password is/i.test(cleanText)
    ) {
      return {
        isSensitive: true,
        category: 'OTP',
        severity: 'Critical',
        matchedKeyword: 'Disclosed Authorization Digits',
        warningLabel: 'POSSIBLE CREDENTIAL EXPOSURE: Employee spoken authorization digits detected',
        recommendedAction: 'Terminate call immediately and trigger the 60-minute Golden-Hour banking freeze.',
      };
    }
  }

  // Check OTP solicitation first (highest severity)
  if (OTP_REGEX.test(cleanText) || OTP_ACTION_REGEX.test(cleanText)) {
    const match = cleanText.match(OTP_REGEX)?.[0] || 'OTP Request';
    return {
      isSensitive: true,
      category: 'OTP',
      severity: 'Critical',
      matchedKeyword: match,
      warningLabel: 'CRITICAL RISK: Unauthorized OTP / Verification Code Solicitation',
      recommendedAction: 'DO NOT share OTP, verification codes, or PINs. Organizations will NEVER ask for OTP over phone calls.',
    };
  }

  // Check Banking Credentials (PIN, CVV, Card number)
  if (BANK_CREDENTIAL_REGEX.test(cleanText)) {
    const match = cleanText.match(BANK_CREDENTIAL_REGEX)?.[0] || 'Banking Credential';
    return {
      isSensitive: true,
      category: 'Bank Credentials',
      severity: 'Critical',
      matchedKeyword: match,
      warningLabel: 'CRITICAL RISK: Banking PIN / CVV / Card Detail Solicitation',
      recommendedAction: 'NEVER disclose card CVV, ATM PIN, or banking passwords over phone calls. Disconnect immediately.',
    };
  }

  // Check Account Passwords
  if (PASSWORD_REGEX.test(cleanText)) {
    const match = cleanText.match(PASSWORD_REGEX)?.[0] || 'Password';
    return {
      isSensitive: true,
      category: 'Account Password',
      severity: 'Critical',
      matchedKeyword: match,
      warningLabel: 'CRITICAL RISK: Account Password Solicitation',
      recommendedAction: 'Do not disclose your password or secret keys under any circumstances.',
    };
  }

  // Check KYC / Identity Document Demands
  if (IDENTITY_KYC_REGEX.test(cleanText)) {
    const match = cleanText.match(IDENTITY_KYC_REGEX)?.[0] || 'KYC / Identity Solicitation';
    return {
      isSensitive: true,
      category: 'Identity Document',
      severity: 'High',
      matchedKeyword: match,
      warningLabel: 'HIGH RISK: Unsolicited KYC / Identity Information Request',
      recommendedAction: 'Verify through official bank branch or portal. Do not share Aadhaar/PAN over unsolicited calls.',
    };
  }

  // Check Urgent Wire Transfer Demands
  if (URGENT_FINANCIAL_REGEX.test(cleanText)) {
    const match = cleanText.match(URGENT_FINANCIAL_REGEX)?.[0] || 'Wire Transfer Demand';
    return {
      isSensitive: true,
      category: 'Payment Transfer',
      severity: 'High',
      matchedKeyword: match,
      warningLabel: 'HIGH RISK: Urgent Payment / Wire Transfer Demand',
      recommendedAction: 'Out-of-band supervisor confirmation required before executing any funds transfer.',
    };
  }

  return {
    isSensitive: false,
    category: 'None',
    severity: 'Safe',
    matchedKeyword: null,
    warningLabel: 'Normal conversation',
    recommendedAction: 'Continue normal call workflow.',
  };
}

/**
 * Regex for highlighting sensitive keywords in conversation transcripts
 */
export const SENSITIVE_KEYWORDS_REGEX =
  /\b(OTP|one[- ]?time[- ]?password|verification[- ]?code|security[- ]?code|auth[- ]?code|passcode|PIN|CVV|CVV2|MPIN|UPI[- ]?PIN|password|Aadhaar|PAN[- ]?card|wire[- ]?transfer|urgent|immediately|quick|emergency|blocked|suspended)\b/gi;
