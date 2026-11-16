import type { Room, RoomType } from "../model/types";
import { ROOM_TYPE_LABELS, floorNameFor } from "../model/defaults";

/**
 * Optional plan-label languages. Only the NAMES ON THE DRAWING change (room names, stair arrows, entrance and exit,
 * floor names). Numbers, units and the data you saved stay as they are, and names you typed yourself are never
 * changed. The translations are common everyday building terms; please have a native speaker check them before a
 * drawing is used officially.
 */
export type LabelLang = "en" | "hi" | "mr" | "ta" | "te" | "bn" | "gu" | "kn" | "ml";

export const LANGS: Array<{ code: LabelLang; name: string; english: string }> = [
  { code: "en", name: "English", english: "English" },
  { code: "hi", name: "हिन्दी", english: "Hindi" },
  { code: "mr", name: "मराठी", english: "Marathi" },
  { code: "ta", name: "தமிழ்", english: "Tamil" },
  { code: "te", name: "తెలుగు", english: "Telugu" },
  { code: "bn", name: "বাংলা", english: "Bengali" },
  { code: "gu", name: "ગુજરાતી", english: "Gujarati" },
  { code: "kn", name: "ಕನ್ನಡ", english: "Kannada" },
  { code: "ml", name: "മലയാളം", english: "Malayalam" },
];

export const isLang = (v: unknown): v is LabelLang => LANGS.some((l) => l.code === v);

/** font list that works for every script on common phones, Windows, Mac and Linux, falling back letter by letter */
export const LABEL_FONT_STACK =
  `'Noto Sans', 'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Bengali', 'Noto Sans Gujarati', 'Noto Sans Kannada', 'Noto Sans Malayalam', 'Nirmala UI', Mangal, 'Kohinoor Devanagari', Latha, Gautami, Vrinda, Shruti, Tunga, Kartika, Arial, Helvetica, sans-serif`;

type Names = Record<RoomType, string>;

const hi: Names = { living: "लिविंग रूम", bedroom: "बेडरूम", "master-bedroom": "मास्टर बेडरूम", kitchen: "किचन", dining: "डाइनिंग", bathroom: "बाथरूम", toilet: "टॉयलेट", utility: "यूटिलिटी", store: "स्टोर", study: "स्टडी रूम", balcony: "बालकनी", lobby: "लॉबी", staircase: "सीढ़ी", garage: "गैराज", office: "ऑफिस", reception: "रिसेप्शन", "meeting-room": "मीटिंग रूम", classroom: "कक्षा", ward: "वार्ड", shop: "दुकान", hall: "हॉल", warehouse: "गोदाम", workshop: "कार्यशाला", laboratory: "प्रयोगशाला", corridor: "गलियारा", lift: "लिफ्ट", parking: "पार्किंग", pantry: "पैंट्री", custom: "कमरा" };
const mr: Names = { living: "दिवाणखाना", bedroom: "बेडरूम", "master-bedroom": "मास्टर बेडरूम", kitchen: "स्वयंपाकघर", dining: "जेवणाची खोली", bathroom: "स्नानगृह", toilet: "शौचालय", utility: "यूटिलिटी", store: "स्टोअर रूम", study: "अभ्यासिका", balcony: "बाल्कनी", lobby: "लॉबी", staircase: "जिना", garage: "गॅरेज", office: "कार्यालय", reception: "स्वागत कक्ष", "meeting-room": "बैठक खोली", classroom: "वर्गखोली", ward: "वॉर्ड", shop: "दुकान", hall: "हॉल", warehouse: "गोदाम", workshop: "कार्यशाळा", laboratory: "प्रयोगशाळा", corridor: "पॅसेज", lift: "लिफ्ट", parking: "पार्किंग", pantry: "पँट्री", custom: "खोली" };
const ta: Names = { living: "வரவேற்பு அறை", bedroom: "படுக்கையறை", "master-bedroom": "முதன்மை படுக்கையறை", kitchen: "சமையலறை", dining: "உணவு அறை", bathroom: "குளியலறை", toilet: "கழிவறை", utility: "பயன்பாட்டு அறை", store: "சேமிப்பு அறை", study: "படிப்பறை", balcony: "பால்கனி", lobby: "லாபி", staircase: "படிக்கட்டு", garage: "கேரேஜ்", office: "அலுவலகம்", reception: "வரவேற்பு", "meeting-room": "கூட்ட அறை", classroom: "வகுப்பறை", ward: "வார்டு", shop: "கடை", hall: "மண்டபம்", warehouse: "கிடங்கு", workshop: "பட்டறை", laboratory: "ஆய்வகம்", corridor: "நடைவழி", lift: "மின்தூக்கி", parking: "வாகன நிறுத்தம்", pantry: "சரக்கறை", custom: "அறை" };
const te: Names = { living: "లివింగ్ రూమ్", bedroom: "పడకగది", "master-bedroom": "మాస్టర్ పడకగది", kitchen: "వంటగది", dining: "భోజనాల గది", bathroom: "స్నానాల గది", toilet: "మరుగుదొడ్డి", utility: "యుటిలిటీ", store: "స్టోర్ రూమ్", study: "చదువు గది", balcony: "బాల్కనీ", lobby: "లాబీ", staircase: "మెట్లు", garage: "గ్యారేజ్", office: "కార్యాలయం", reception: "రిసెప్షన్", "meeting-room": "సమావేశ గది", classroom: "తరగతి గది", ward: "వార్డు", shop: "దుకాణం", hall: "హాల్", warehouse: "గిడ్డంగి", workshop: "వర్క్ షాప్", laboratory: "ప్రయోగశాల", corridor: "నడవ", lift: "లిఫ్ట్", parking: "పార్కింగ్", pantry: "ప్యాంట్రీ", custom: "గది" };
const bn: Names = { living: "বসার ঘর", bedroom: "শোবার ঘর", "master-bedroom": "মাস্টার বেডরুম", kitchen: "রান্নাঘর", dining: "খাওয়ার ঘর", bathroom: "স্নানঘর", toilet: "শৌচাগার", utility: "ইউটিলিটি", store: "স্টোর রুম", study: "পড়ার ঘর", balcony: "বারান্দা", lobby: "লবি", staircase: "সিঁড়ি", garage: "গ্যারেজ", office: "অফিস", reception: "রিসেপশন", "meeting-room": "সভাকক্ষ", classroom: "শ্রেণিকক্ষ", ward: "ওয়ার্ড", shop: "দোকান", hall: "হলঘর", warehouse: "গুদাম", workshop: "কারখানা", laboratory: "গবেষণাগার", corridor: "করিডোর", lift: "লিফট", parking: "পার্কিং", pantry: "প্যান্ট্রি", custom: "ঘর" };
const gu: Names = { living: "લિવિંગ રૂમ", bedroom: "બેડરૂમ", "master-bedroom": "માસ્ટર બેડરૂમ", kitchen: "રસોડું", dining: "ડાઇનિંગ", bathroom: "બાથરૂમ", toilet: "શૌચાલય", utility: "યુટિલિટી", store: "સ્ટોર રૂમ", study: "અભ્યાસ ખંડ", balcony: "બાલ્કની", lobby: "લોબી", staircase: "દાદર", garage: "ગેરેજ", office: "ઓફિસ", reception: "રિસેપ્શન", "meeting-room": "મીટિંગ રૂમ", classroom: "વર્ગખંડ", ward: "વોર્ડ", shop: "દુકાન", hall: "હોલ", warehouse: "ગોડાઉન", workshop: "કારખાનું", laboratory: "પ્રયોગશાળા", corridor: "કોરિડોર", lift: "લિફ્ટ", parking: "પાર્કિંગ", pantry: "પેન્ટ્રી", custom: "રૂમ" };
const kn: Names = { living: "ವಾಸದ ಕೋಣೆ", bedroom: "ಮಲಗುವ ಕೋಣೆ", "master-bedroom": "ಮುಖ್ಯ ಮಲಗುವ ಕೋಣೆ", kitchen: "ಅಡುಗೆಮನೆ", dining: "ಊಟದ ಕೋಣೆ", bathroom: "ಸ್ನಾನಗೃಹ", toilet: "ಶೌಚಾಲಯ", utility: "ಯುಟಿಲಿಟಿ", store: "ಸಂಗ್ರಹ ಕೋಣೆ", study: "ಓದುವ ಕೋಣೆ", balcony: "ಬಾಲ್ಕನಿ", lobby: "ಲಾಬಿ", staircase: "ಮೆಟ್ಟಿಲು", garage: "ಗ್ಯಾರೇಜ್", office: "ಕಚೇರಿ", reception: "ಸ್ವಾಗತ", "meeting-room": "ಸಭಾ ಕೊಠಡಿ", classroom: "ತರಗತಿ", ward: "ವಾರ್ಡ್", shop: "ಅಂಗಡಿ", hall: "ಸಭಾಂಗಣ", warehouse: "ಗೋದಾಮು", workshop: "ಕಾರ್ಯಾಗಾರ", laboratory: "ಪ್ರಯೋಗಾಲಯ", corridor: "ಕಾರಿಡಾರ್", lift: "ಲಿಫ್ಟ್", parking: "ಪಾರ್ಕಿಂಗ್", pantry: "ಪ್ಯಾಂಟ್ರಿ", custom: "ಕೋಣೆ" };
const ml: Names = { living: "സ്വീകരണമുറി", bedroom: "കിടപ്പുമുറി", "master-bedroom": "മാസ്റ്റർ കിടപ്പുമുറി", kitchen: "അടുക്കള", dining: "ഊണുമുറി", bathroom: "കുളിമുറി", toilet: "ശൗചാലയം", utility: "യൂട്ടിലിറ്റി", store: "സ്റ്റോർ റൂം", study: "പഠനമുറി", balcony: "ബാൽക്കണി", lobby: "ലോബി", staircase: "പടിക്കെട്ട്", garage: "ഗാരേജ്", office: "ഓഫീസ്", reception: "റിസപ്ഷൻ", "meeting-room": "മീറ്റിംഗ് റൂം", classroom: "ക്ലാസ് മുറി", ward: "വാർഡ്", shop: "കട", hall: "ഹാൾ", warehouse: "ഗോഡൗൺ", workshop: "വർക്ക്ഷോപ്പ്", laboratory: "ലബോറട്ടറി", corridor: "ഇടനാഴി", lift: "ലിഫ്റ്റ്", parking: "പാർക്കിംഗ്", pantry: "കലവറ", custom: "മുറി" };

export const ROOM_NAMES: Record<Exclude<LabelLang, "en">, Names> = { hi, mr, ta, te, bn, gu, kn, ml };

interface Terms { up: string; down: string; entrance: string; exit: string; vehicle: string; floors: [string, string, string, string]; floor: string }
export const TERMS: Record<Exclude<LabelLang, "en">, Terms> = {
  hi: { up: "ऊपर", down: "नीचे", entrance: "मुख्य प्रवेश", exit: "निकास", vehicle: "वाहन प्रवेश", floors: ["भूतल", "प्रथम तल", "द्वितीय तल", "तृतीय तल"], floor: "तल" },
  mr: { up: "वर", down: "खाली", entrance: "मुख्य प्रवेशद्वार", exit: "निर्गम", vehicle: "वाहन प्रवेश", floors: ["तळमजला", "पहिला मजला", "दुसरा मजला", "तिसरा मजला"], floor: "मजला" },
  ta: { up: "மேலே", down: "கீழே", entrance: "முதன்மை நுழைவு", exit: "வெளியேறு", vehicle: "வாகன நுழைவு", floors: ["தரைத்தளம்", "முதல் தளம்", "இரண்டாம் தளம்", "மூன்றாம் தளம்"], floor: "தளம்" },
  te: { up: "పైకి", down: "కిందికి", entrance: "ప్రధాన ప్రవేశం", exit: "నిష్క్రమణ", vehicle: "వాహన ప్రవేశం", floors: ["గ్రౌండ్ ఫ్లోర్", "మొదటి అంతస్తు", "రెండవ అంతస్తు", "మూడవ అంతస్తు"], floor: "అంతస్తు" },
  bn: { up: "উপরে", down: "নীচে", entrance: "প্রধান প্রবেশপথ", exit: "প্রস্থান", vehicle: "গাড়ির প্রবেশপথ", floors: ["নিচতলা", "দোতলা", "তিনতলা", "চারতলা"], floor: "তলা" },
  gu: { up: "ઉપર", down: "નીચે", entrance: "મુખ્ય પ્રવેશ", exit: "નિકાસ", vehicle: "વાહન પ્રવેશ", floors: ["ભોંયતળિયું", "પહેલો માળ", "બીજો માળ", "ત્રીજો માળ"], floor: "માળ" },
  kn: { up: "ಮೇಲೆ", down: "ಕೆಳಗೆ", entrance: "ಮುಖ್ಯ ಪ್ರವೇಶ", exit: "ನಿರ್ಗಮನ", vehicle: "ವಾಹನ ಪ್ರವೇಶ", floors: ["ನೆಲ ಮಹಡಿ", "ಮೊದಲ ಮಹಡಿ", "ಎರಡನೇ ಮಹಡಿ", "ಮೂರನೇ ಮಹಡಿ"], floor: "ಮಹಡಿ" },
  ml: { up: "മുകളിലേക്ക്", down: "താഴേക്ക്", entrance: "പ്രധാന പ്രവേശനം", exit: "പുറത്തേക്ക്", vehicle: "വാഹന പ്രവേശനം", floors: ["താഴത്തെ നില", "ഒന്നാം നില", "രണ്ടാം നില", "മൂന്നാം നില"], floor: "നില" },
};

/** English names the app itself gives rooms. Only these are translated; anything else you typed stays as you typed it. */
const KNOWN = new Set<string>([
  ...Object.values(ROOM_TYPE_LABELS).map((s) => s.toLowerCase()),
  "living room", "master bedroom", "bedroom", "dining", "dining room", "kitchen", "bathroom", "bath", "toilet", "guest toilet", "attached bath", "wet core",
  "utility", "store", "staircase", "lobby", "corridor", "lift", "reception", "balcony", "garage", "family lounge", "guest room", "study", "office", "hall",
]);

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+\d+$/, "").replace(/\s+/g, " ");

/** The name to show on the drawing for this room in the chosen language. */
export function localRoomName(room: Pick<Room, "name" | "type">, lang: LabelLang): string {
  if (lang === "en") return room.name;
  const base = norm(room.name);
  if (!base || !KNOWN.has(base)) return room.name;
  const num = room.name.trim().match(/\s+(\d+)$/);
  const text = ROOM_NAMES[lang][room.type] ?? room.name;
  return num ? `${text} ${num[1]}` : text;
}

/** Floor name in the chosen language, for the default names ("Ground Floor", "First Floor", "Floor 4"). */
export function floorLabel(name: string, index: number, lang: LabelLang): string {
  if (lang === "en") return name;
  if (name !== floorNameFor(index)) return name;
  const t = TERMS[lang];
  return index >= 0 && index < 4 ? t.floors[index] : `${t.floor} ${index}`;
}

export function termsFor(lang: LabelLang): Terms | null {
  return lang === "en" ? null : TERMS[lang];
}
