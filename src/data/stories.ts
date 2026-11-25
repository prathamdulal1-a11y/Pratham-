export type VoiceOption = "Charon" | "Fenrir" | "Puck";
export type PacingOption = "slow-lingering" | "slow-medium" | "measured";
export type DepthOption = "quiet-intimate" | "balanced-nostalgia" | "deeply-vulnerable";

export interface StoryPreset {
  id: string;
  chapterLabel: string;
  nepaliTitle: string;
  englishTitle: string;
  setting: string;
  mood: string;
  imageUrl: string;
  imageAlt: string;
  script: string;
}

export interface NarrationTake {
  id: string;
  title: string;
  excerpt: string;
  audioUrl: string;
  voiceName: VoiceOption;
  pacing: PacingOption;
  depth: DepthOption;
  durationSec: number;
  createdAt: string;
  isPassage: boolean;
}

export const VOICE_OPTIONS: Array<{
  id: VoiceOption;
  label: string;
  character: string;
}> = [
  {
    id: "Charon",
    label: "Charon",
    character: "Deep, warm mature male",
  },
  {
    id: "Fenrir",
    label: "Fenrir",
    character: "Huskier, textured baritone",
  },
  {
    id: "Puck",
    label: "Puck",
    character: "Soft, intimate conversational",
  },
];

export const PACING_OPTIONS: Array<{
  id: PacingOption;
  label: string;
}> = [
  { id: "slow-lingering", label: "Slow & Lingering" },
  { id: "slow-medium", label: "Slow to Medium" },
  { id: "measured", label: "Measured" },
];

export const DEPTH_OPTIONS: Array<{
  id: DepthOption;
  label: string;
}> = [
  { id: "quiet-intimate", label: "Quiet & Intimate" },
  { id: "balanced-nostalgia", label: "Tender Nostalgia" },
  { id: "deeply-vulnerable", label: "Deeply Vulnerable" },
];

export const PERSONA_SPEC_SUMMARY = [
  {
    label: "Voice & Texture",
    detail: "Warm, slightly deep mature Nepali male voice with soft huskiness and quiet vulnerability.",
  },
  {
    label: "Emotional Arc",
    detail: "Mysterious hook, reflective pauses after poignant lines, swelling nostalgia, and peaceful closure.",
  },
  {
    label: "Delivery Guardrails",
    detail: "Conversational Nepali pronunciation; no news-anchor cadence, theatrics, or forced cheerfulness.",
  },
  {
    label: "Script Fidelity",
    detail: "Reads the provided Nepali Devanagari text word-for-word without translating or adding words.",
  },
];

export const STORY_PRESETS: StoryPreset[] = [
  {
    id: "adhuro-chithi",
    chapterLabel: "Chapter 01",
    nepaliTitle: "अधुरो चिठी",
    englishTitle: "The Unsent Letter",
    setting: "Rainy midnight · Window desk",
    mood: "Longing & quiet memory",
    imageUrl: "/src/assets/images/story_cover_rain_1795589011659.jpg",
    imageAlt: "Open handwritten journal and fountain pen under a warm lamp beside a rain-streaked window",
    script: `कतिपय कथाहरू कहिल्यै सकिँदैनन्... ती त केवल मनको कुनामा चुपचाप बसिरहन्छन्।

साउनको त्यो साँझ आज पनि मेरो आँखाअगाडि ताजै छ। बाहिर सिमसिम पानी परिरहेको थियो, अनि सानो चिया पसलको कुनामा हामी दुई जना आमनेसामने थियौँ। त्यतिबेला हाम्रो बीचमा शब्दहरू कम थिए... तर मौनताले नै धेरै कुरा बोलिरहेको थियो।

तिमीले चियाको गिलास हातमा लिँदै भन्यौ, "सायद समयले हामीलाई फेरि एकै बाटोमा ल्याउँदैन होला।" म केही बोल्न सकिनँ। मात्रै तिम्रो आँखामा हेरिरहेँ... जहाँ हल्का आँसु र अनगिन्ती अधुरा सपनाहरू अड्किएका थिए।

आज वर्षौँ बितिसक्यो। सहर उस्तै छ, साउनको पानी पनि उस्तै गरी पर्छ... तर तिम्रो खाली ठाउँ कहिल्यै भरिएन। सायद साँचो माया भनेको सँगै हुनु मात्र होइन रहेछ... टाढा भएर पनि कसैको खुसीका लागि मौन प्रार्थना गरिरहनु पो रहेछ।`,
  },
  {
    id: "patan-ko-sanjh",
    chapterLabel: "Chapter 02",
    nepaliTitle: "पाटनको साँझ",
    englishTitle: "An Evening in Patan",
    setting: "Dusk courtyard · Lantern glow",
    mood: "Nostalgia & gentle distance",
    imageUrl: "/src/assets/images/story_cover_kathmandu_1795589012733.jpg",
    imageAlt: "Historic brick Kathmandu courtyard rooftops at dusk with a warm lantern glowing in a carved window",
    script: `केही बाटाहरू हामीले सँगै हिँड्यौँ... तर गन्तव्य भने एउटै लेखिएको रहेनछ।

पाटनको पुरानो गल्लीमा साँझ पर्न लाग्दा, इँटाका भित्ताहरूमा पहेंलो बत्तीको उज्यालो पोखिन्थ्यो। त्यही उज्यालोमा तिम्रो छाया मेरो छेउमा हिँड्दा, मलाई लाग्थ्यो यो समय यहीँ थामिए हुन्थ्यो। तिमी हाँस्थ्याै, अनि म त्यो हाँसोलाई सधैँका लागि मनमा साँचेर राख्थेँ।

हामीले कहिल्यै ठूला वाचा गरेनौँ। न त सँगै मर्ने कसम खायौँ... तर हरेक सानो भेटमा एउटा सिंगो जीवन बाँचेजस्तो लाग्थ्यो। पछि जब दूरी बढ्दै गयो, फोनका घण्टीहरू कम हुँदै गए... तब मात्र थाहा भयो, मान्छे टाढा जाँदा आवाज मात्र होइन, आफ्नै मनको एउटा हिस्सा पनि हराउँदो रहेछ।

आज पनि जब साँझपख चिसो हावा चल्छ, म त्यो पुरानो गल्ली सम्झन्छु। तिमी कहाँ छौ, कस्ती छौ, थाहा छैन... तर मेरो हरेक शान्त साँझमा, तिमी अझै पनि मेरै छेउमा हिँडिरहेकी हुन्छ्यौ।`,
  },
  {
    id: "maunata",
    chapterLabel: "Chapter 03",
    nepaliTitle: "तिमी र म बिचको मौनता",
    englishTitle: "The Silence Between Us",
    setting: "Aged twine letters · Cold tea",
    mood: "Peaceful heartbreak",
    imageUrl: "/src/assets/images/story_cover_letter_1795589012912.jpg",
    imageAlt: "Folded aged paper letters tied with twine next to a brass key and ceramic tea cup",
    script: `सबैभन्दा गहिरो चोट त्यतिबेला लाग्दो रहेछ... जब कोही नरिसाईकन नै बिस्तारै जीवनबाट टाढिन्छ।

दराजको पुरानो कुनामा अझै पनि तिम्रा अक्षरहरू सुरक्षित छन्। मसी अलि फिका भएको छ, कागज पनि खुम्चिएको छ... तर ती पानाहरू पल्टाउँदा आज पनि तिम्रो आवाज कानमा गुन्जिएजस्तो लाग्छ। पहिले म सोच्थेँ, समय बित्दै गएपछि बिर्सन सजिलो हुन्छ होला। तर समयले त केवल सहन सिकाउँदो रहेछ, बिर्सन होइन।

मलाई तिमीसँग कुनै गुनासो छैन। तिमीले आफ्नो बाटो रोज्यौ, मैले तिम्रा सम्झनाहरू। कति रात तिम्रो नाम लेखेर मेटाएँ... कति बिहानी तिम्रै यादमा चिया चिसो बनाएँ।

अब त मन पनि शान्त भइसकेको छ। पीडा अझै छ, तर त्यो पीडामा पनि एउटा अनौठो मिठास छ। किनकि कमसेकम मेरो जीवनमा कोही त्यस्तो थियो... जसलाई मैले कुनै स्वार्थबिना, पूरै हृदयले माया गर्न सकेँ।`,
  },
];
