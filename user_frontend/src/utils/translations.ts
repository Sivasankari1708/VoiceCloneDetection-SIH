export const TRANSLATIONS = {
  en: {
    safe: "Communication appears safe.",
    low: "Stay alert. Continue with caution.",
    medium: "Please verify the caller before sharing sensitive information.",
    high: "High-risk communication detected. Additional verification is required.",
    critical: "Critical security warning. Do not share credentials or financial information.",
    verification: "Verify the caller using an independent method.",
    liveness: "Liveness verification is required.",
    verification_failed: "Caller verification failed. End the call or use independent verification.",
    protection: "This communication has been protected for your security."
  },
  ta: {
    safe: "தொடர்பு பாதுகாப்பானதாகத் தெரிகிறது.",
    low: "விழிப்புடன் இருங்கள். கவனமாகத் தொடரவும்.",
    medium: "முக்கியமான தகவல்களைப் பகிரும் முன் அழைப்பாளரைச் சரிபார்க்கவும்.",
    high: "அதிக ஆபத்துள்ள தொடர்பு கண்டறியப்பட்டுள்ளது. கூடுதல் சரிபார்ப்பு தேவை.",
    critical: "தீவிர பாதுகாப்பு எச்சரிக்கை. நற்சான்றிதழ்கள் அல்லது நிதித் தகவல்களைப் பகிர வேண்டாம்.",
    verification: "சுயாதீனமான முறையைப் பயன்படுத்தி அழைப்பாளரைச் சரிபார்க்கவும்.",
    liveness: "நேரடி சரிபார்ப்பு தேவை.",
    verification_failed: "அழைப்பாளர் சரிபார்ப்பு தோல்வியடைந்தது. அழைப்பை முடிக்கவும் அல்லது சுயாதீன சரிபார்ப்பைப் பயன்படுத்தவும்.",
    protection: "உங்கள் பாதுகாப்பிற்காக இந்தத் தொடர்பு பாதுகாக்கப்பட்டுள்ளது."
  },
  hi: {
    safe: "संचार सुरक्षित प्रतीत होता है।",
    low: "सतर्क रहें। सावधानी के साथ आगे बढ़ें।",
    medium: "संवेदनशील जानकारी साझा करने से पहले कृपया कॉलर को सत्यापित करें।",
    high: "उच्च जोखिम वाले संचार का पता चला। अतिरिक्त सत्यापन आवश्यक है।",
    critical: "गंभीर सुरक्षा चेतावनी। क्रेडेंशियल या वित्तीय जानकारी साझा न करें।",
    verification: "स्वतंत्र तरीके का उपयोग करके कॉलर को सत्यापित करें।",
    liveness: "जीवंतता सत्यापन की आवश्यकता है।",
    verification_failed: "कॉलर सत्यापन विफल रहा। कॉल समाप्त करें या स्वतंत्र सत्यापन का उपयोग करें।",
    protection: "यह संचार आपकी सुरक्षा के लिए सुरक्षित किया गया है।"
  }
};

export function getWarningText(key: keyof typeof TRANSLATIONS.en, lang: "en" | "ta" | "hi" = "en"): string {
  return TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key];
}

