// ─── Executive Knowledge Acquisition Engine V1 ────────────────────────────────
//
// Sohbet sırasında 3 kritik knowledge key'ini tespit eder.
// V1 kapsamı: industry, business_model, employee_count.
// Prisma import yok. DB çağrısı yok. Saf detection.
// Duplicate kontrolü Candidate Engine'e bırakılmıştır.

import { getKnowledgeKey } from "./executive-knowledge-registry";
import type {
  KnowledgeAcquisitionInput,
  KnowledgeDetectionResult,
} from "./executive-knowledge-acquisition-engine.types";

type SignalDefinition = {
  targetKey: string;
  detect: (msg: string) => string | null;
};

function normalize(message: string): string {
  return message.toLocaleLowerCase("tr-TR").trim();
}

const SIGNALS: SignalDefinition[] = [

  // industry
  // Tetikleyici: "mermer sektöründeyiz", "tekstil alanında çalışıyoruz"
  {
    targetKey: "industry",
    detect(msg) {
      const patterns = [
        /^(.{3,40}?)\s*sektöründe(?:yiz|yim)?\b/,
        /([^\s,].{2,38}?)\s+sektöründe\s+(?:faaliyet|çalış)/,
        /([^\s,].{2,38}?)\s+alanında\s+(?:faaliyet|çalış)/,
        /([^\s,].{2,38}?)\s+sektörü(?:nde|nü)?\s+(?:faaliyet|çalış)/,
      ];
      for (const p of patterns) {
        const m = msg.match(p);
        if (m?.[1]) {
          const val = m[1].trim().replace(/^(biz\s+)/i, "");
          if (val.length >= 3 && val.length <= 40 && !/^\d+$/.test(val)) return val;
        }
      }
      return null;
    },
  },

  // business_model (alias: businessType)
  // Tetikleyici: "toptan satış yapıyoruz", "üretim yapıyoruz", "perakende satış"
  {
    targetKey: "business_model",
    detect(msg) {
      if (/toptan\s*sat/.test(msg) || /toptancı/.test(msg)) return "toptan satış";
      if (/perakende\s*sat/.test(msg) || /perakendeci/.test(msg)) return "perakende";
      if (/üretim\s*(?:yapıyor|işi|fabrika)/.test(msg) || /üretici(?:yiz|yim)?/.test(msg)) return "üretim";
      if (/hizmet\s*sektörü/.test(msg) || /hizmet\s*(?:veriyor|işi|şirketi)/.test(msg)) return "hizmet";
      if (/proje\s*bazlı/.test(msg) || /taahhüt\s*(?:işi|yapıyor)/.test(msg)) return "proje bazlı";
      if (/abonelik\s*(?:modeli|sistemi|ile|bazlı)/.test(msg)) return "abonelik";
      if (/ihracat\s*(?:yapıyor|işi|firması)/.test(msg)) return "ihracat";
      if (/e[\-\s]?ticaret\s*(?:yapıyor|işi|sitesi)/.test(msg)) return "e-ticaret";
      return null;
    },
  },

  // employee_count (alias: team_size)
  // Tetikleyici: "12 kişiyiz", "ekibimiz 8 kişi", "8 çalışanımız var"
  {
    targetKey: "employee_count",
    detect(msg) {
      const patterns = [
        /(\d+)\s*kişilik?\s*(?:ekib|takım|personel|çalışan)/,
        /ekib(?:imiz|im)?\s+(\d+)\s*kişi/,
        /takım(?:ımız|ım)?\s+(\d+)\s*kişi/,
        /(\d+)\s*(?:kişiyi[zm]|kişiyiz|kişiyim)/,
        /toplam\s+(\d+)\s*(?:kişi|çalışan|personel)/,
        /(\d+)\s*(?:çalışan|personel)(?:ımız|imiz)?\s*var/,
        /(?:çalışan|personel)\s+sayımız\s+(\d+)/,
      ];
      for (const p of patterns) {
        const m = msg.match(p);
        if (m?.[1] && parseInt(m[1]) > 0) return `${m[1]} kişi`;
      }
      return null;
    },
  },

  // response_length_preference
  // Kalıcı tercih tetikleyicisi: mesajda genel/süreklilik belirten bir kapsam
  // ifadesi ("bundan sonra", "genelde", çoğul "cevapları") olmalı — yoksa bu
  // sadece o anki cevaba yönelik turn-içi bir komuttur (bkz.
  // conversation-continuity-detector.ts) ve kalıcı tercih üretilmez.
  // Örn: "Bundan sonra cevapları kısa tut." → concise. "Bu cevabı kısa yaz." → hiç.
  {
    targetKey: "response_length_preference",
    detect(msg) {
      if (!hasPersistentScope(msg, "response_length")) return null;
      if (CONCISE_PHRASES.some((p) => msg.includes(p))) return "concise";
      if (DETAILED_PHRASES.some((p) => msg.includes(p))) return "detailed";
      return null;
    },
  },

  // question_frequency_preference
  // Aynı kural: genel/süreklilik ifadesi ("sürekli", "her seferinde",
  // "karar vermeden önce") olmadan tetiklenmez. "Bu konuda bana soru sorma."
  // konuya özel/turn-içidir → tetiklenmez.
  {
    targetKey: "question_frequency_preference",
    detect(msg) {
      if (!hasPersistentScope(msg, "question_frequency")) return null;
      if (MINIMIZE_QUESTION_PHRASES.some((p) => msg.includes(p))) {
        return "minimize_unnecessary_questions";
      }
      if (ASK_MORE_QUESTION_PATTERNS.some((p) => p.test(msg))) {
        return "ask_more_before_deciding";
      }
      return null;
    },
  },

];

const GENERAL_PERSISTENCE_MARKERS = [
  "bundan sonra",
  "bundan böyle",
  "artık",
  "genelde",
  "her zaman",
  "sürekli",
  "her seferinde",
];

const QUESTION_FREQUENCY_EXTRA_MARKERS = [
  "karar vermeden önce",
  "karar almadan önce",
];

const CONCISE_PHRASES = [
  "kısa tut",
  "kısa ve net",
  "kısaca söyle",
  "kısa cevap ver",
  "kısa konuş",
  "özetle",
  "detaya girme",
  "uzun anlatma",
];

const DETAILED_PHRASES = [
  "detaylı anlat",
  "detaylı cevap ver",
  "ayrıntılı anlat",
  "ayrıntılı cevap ver",
];

const MINIMIZE_QUESTION_PHRASES = ["soru sorma"];

const ASK_MORE_QUESTION_PATTERNS = [/daha\s+(çok|fazla)\s+soru\s+sor/];

function hasPersistentScope(
  msg: string,
  dimension: "response_length" | "question_frequency",
): boolean {
  if (GENERAL_PERSISTENCE_MARKERS.some((marker) => msg.includes(marker))) {
    return true;
  }

  if (dimension === "question_frequency") {
    return QUESTION_FREQUENCY_EXTRA_MARKERS.some((marker) => msg.includes(marker));
  }

  // "cevapları kısa tut" (çoğul, genel) vs "bu cevabı kısa yaz" (bu + tekil,
  // sadece o anki cevap). Çoğul biçim, "bu cevabı/cevaplarını" ile
  // nitelenmediği sürece genel bir çalışma tercihi olarak kabul edilir.
  return msg.includes("cevapları") && !msg.includes("bu cevabı");
}

export function detectExecutiveKnowledge(
  input: KnowledgeAcquisitionInput,
): KnowledgeDetectionResult[] {
  const msg = normalize(input.message);
  const results: KnowledgeDetectionResult[] = [];

  for (const signal of SIGNALS) {
    const entry = getKnowledgeKey(signal.targetKey);
    if (!entry) continue;
    if (!entry.acquisitionModes.includes("CONVERSATION")) continue;

    const detectedValue = signal.detect(msg);
    if (!detectedValue || detectedValue.trim().length === 0) continue;

    const resolvedFromAlias =
      signal.targetKey !== entry.key ? signal.targetKey : null;

    results.push({
      canonicalKey: entry.key,
      detectedValue: detectedValue.trim(),
      resolvedFromAlias,
      knowledgeLevel: entry.level,
      confidence: entry.defaultConfidence,
      isAssumption: entry.defaultIsAssumption,
    });
  }

  return results;
}
