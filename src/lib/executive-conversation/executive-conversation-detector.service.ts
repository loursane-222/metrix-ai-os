import type { ConversationSignalType } from "./executive-conversation.types";

type KeywordSet = {
  type: ConversationSignalType;
  baseConfidence: number;
  keywords: string[];
};

const MIN_CONFIDENCE = 0.65;
const MATCH_BOOST = 0.07;
const MAX_CONFIDENCE = 0.97;

const SIGNAL_KEYWORD_SETS: KeywordSet[] = [
  {
    type: "COMMITMENT",
    baseConfidence: 0.82,
    keywords: [
      "yapacağım",
      "başlıyorum",
      "uygulayacağım",
      "hallettim",
      "tamamladım",
      "uyguladım",
      "başlıyoruz",
      "harekete geçiyorum",
      "bu gün yapacağım",
      "hemen başlıyorum",
      "kararım bu",
      "kesinleştirdim",
    ],
  },
  {
    type: "ACCEPTANCE",
    baseConfidence: 0.70,
    keywords: [
      "mantıklı",
      "tamam",
      "olur",
      "deneyelim",
      "başlayalım",
      "haklısın",
      "güzel fikir",
      "iyi fikir",
      "katılıyorum",
      "doğru söylüyorsun",
      "evet",
      "bunu yapalım",
      "aklıma yattı",
    ],
  },
  {
    type: "REJECTION",
    baseConfidence: 0.75,
    keywords: [
      "istemiyorum",
      "olmaz",
      "katılmıyorum",
      "gerek yok",
      "bunu yapmayalım",
      "hayır",
      "reddediyorum",
      "kabul etmiyorum",
      "bu işe yaramaz",
      "uygun değil",
      "doğru değil",
    ],
  },
  {
    type: "UNCERTAINTY",
    baseConfidence: 0.72,
    keywords: [
      "emin değilim",
      "bilmiyorum",
      "kararsızım",
      "düşünmem lazım",
      "içime sinmedi",
      "kafam karışık",
      "net değil",
      "biraz bekleyelim",
      "düşüneyim",
      "henüz karar vermedim",
      "emin olamıyorum",
      "tereddüt ediyorum",
    ],
  },
  {
    type: "NEW_INFORMATION",
    baseConfidence: 0.73,
    keywords: [
      "aslında",
      "bir de şunu söyleyeyim",
      "yeni bilgi",
      "değişti",
      "güncellendi",
      "bir şey daha var",
      "yeni gelişme",
      "durumum değişti",
      "şunu da belirteyim",
      "bunu da ekleyeyim",
    ],
  },
  {
    type: "OPEN_ENDED",
    baseConfidence: 0.65,
    keywords: [
      "ne düşünüyorsun",
      "ne yapmalıyım",
      "nasıl ilerleyelim",
      "seçenekler neler",
      "başka ne var",
      "devam edelim",
      "anlat",
    ],
  },
];

export function detectConversationSignal(
  message: string,
): { type: ConversationSignalType; confidence: number } | null {
  const normalized = message.toLowerCase();

  let best: { type: ConversationSignalType; confidence: number } | null = null;

  for (const set of SIGNAL_KEYWORD_SETS) {
    const matched = set.keywords.filter((kw) => normalized.includes(kw));
    if (matched.length === 0) continue;

    const boost = Math.min((matched.length - 1) * MATCH_BOOST, 0.18);
    const confidence = Math.min(set.baseConfidence + boost, MAX_CONFIDENCE);

    if (confidence < MIN_CONFIDENCE) continue;

    if (best === null || confidence > best.confidence) {
      best = { type: set.type, confidence };
    }
  }

  return best;
}
