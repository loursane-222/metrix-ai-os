import type { ExecutiveObjectionSignal, ExecutiveObjectionType } from "./executive-recommendation.types";

const MIN_CONFIDENCE = 0.70;

type KeywordSet = {
  type: ExecutiveObjectionType;
  baseConfidence: number;
  keywords: string[];
};

const OBJECTION_KEYWORD_SETS: KeywordSet[] = [
  {
    type: "BUDGET_CONSTRAINT",
    baseConfidence: 0.75,
    keywords: [
      "param yok",
      "bütçem yok",
      "bütçe yok",
      "pahalı",
      "maliyet yüksek",
      "karşılayamam",
      "ödeyemem",
      "bu aya zor",
      "bütçemiz yok",
      "para sıkıntısı",
      "fiyat çok yüksek",
      "maliyetli",
    ],
  },
  {
    type: "TIME_CONSTRAINT",
    baseConfidence: 0.75,
    keywords: [
      "vaktim yok",
      "zamanım yok",
      "yetişemem",
      "çok yoğunum",
      "meşgulüm",
      "bu hafta olmaz",
      "şu an olmaz",
      "zaman bulamıyorum",
      "vakit yok",
      "yetiştirmem zor",
      "bu hafta müsait değilim",
    ],
  },
  {
    type: "TEAM_CONSTRAINT",
    baseConfidence: 0.75,
    keywords: [
      "ekip yok",
      "ekibim yok",
      "personel yok",
      "adam yok",
      "tek başımayım",
      "insan kaynağı yok",
      "çalışanım yok",
      "yeterli personelimiz yok",
      "ekip eksik",
      "kadro yok",
    ],
  },
  {
    type: "ALTERNATIVE_REQUEST",
    baseConfidence: 0.80,
    keywords: [
      "başka yol",
      "alternatif",
      "farklı çözüm",
      "başka seçenek",
      "farklı seçenek",
      "başka bir yöntem",
      "farklı bir yol",
      "seçenek var mı",
      "başka öneriniz",
      "başka yöntem",
    ],
  },
  {
    type: "REJECTION",
    baseConfidence: 0.78,
    keywords: [
      "istemiyorum",
      "katılmıyorum",
      "olmaz",
      "hayır",
      "kabul etmiyorum",
      "uygun değil",
      "yapamam",
      "bu olmaz",
      "red",
      "reddediyorum",
      "kabul etmem",
    ],
  },
  {
    type: "NEW_INFORMATION",
    baseConfidence: 0.72,
    keywords: [
      "aslında",
      "bir de şunu söyleyeyim",
      "yeni bilgi",
      "değişti",
      "güncellendi",
      "bir şey daha var",
      "ek olarak",
      "bir de şu var",
      "şunu da belirteyim",
      "durumum değişti",
      "yeni gelişme",
    ],
  },
];

const MATCH_BOOST = 0.08;
const MAX_CONFIDENCE = 0.97;

export function detectExecutiveObjection(
  message: string,
): ExecutiveObjectionSignal | null {
  const normalized = message.toLowerCase();

  let bestMatch: ExecutiveObjectionSignal | null = null;

  for (const set of OBJECTION_KEYWORD_SETS) {
    const matched = set.keywords.filter((kw) => normalized.includes(kw));
    if (matched.length === 0) continue;

    const boost = Math.min((matched.length - 1) * MATCH_BOOST, 0.2);
    const confidence = Math.min(set.baseConfidence + boost, MAX_CONFIDENCE);

    if (confidence < MIN_CONFIDENCE) continue;

    if (bestMatch === null || confidence > bestMatch.confidence) {
      bestMatch = {
        type: set.type,
        confidence,
        rawKeywords: matched,
      };
    }
  }

  return bestMatch;
}
