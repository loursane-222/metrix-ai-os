import {
  validateExecutivePresenceResponse,
  type ExecutiveIdentityViolation,
} from "@/lib/ai/identity/executive-identity-prompt";
import type { ExecutivePresenceSurface } from "@/lib/ai/identity/executive-identity-prompt";
import {
  resolveLivingExecutiveBehavior,
  validateLivingExecutiveBehavior,
  type LivingBehaviorViolation,
  type LivingExecutiveSemanticHint,
} from "@/lib/ai/living-executive-presence";

type ExecutiveResponseMode =
  | "personal_reflection"
  | "emotional_support"
  | "business_advice"
  | "daily_focus"
  | "casual_conversation";

type SanitizeExecutiveManagerResponseInput = {
  content: string;
  userMessage: string;
  surface?: ExecutivePresenceSurface;
  hasPriorTurns?: boolean;
  semanticHint?: LivingExecutiveSemanticHint | null;
};

type ExecutiveManagerRepairReason =
  | "empty_response"
  | "technical_leak"
  | "casual_context_forced_to_business"
  | LivingBehaviorViolation
  | ExecutiveIdentityViolation;

export type ExecutiveManagerSanitizationResult =
  | {
      content: string;
      needsRepair: false;
    }
  | {
      content: string;
      needsRepair: true;
      reason: ExecutiveManagerRepairReason;
    };

const TECHNICAL_LEAK_PATTERNS: RegExp[] = [
  /\bfirst_goal\b/iu,
  /\bmain_challenge\b/iu,
  /\bmain_bottleneck\b/iu,
  /\bmemory\b/iu,
  /\bhaf[ıi]zamda(?:ki)?\s+\d+/iu,
  /\bhaf[ıi]zamdaki\b/iu,
  /\baktif\s+bilgi\b/iu,
  /\d+\s+stratejik\s+bilgi/iu,
  /\d+\s+s[üu]re[çc]\s+bilgisi/iu,
  /\bmemory\s+count\b/iu,
  /\bmetadata\b/iu,
  /\bconfidence\b/iu,
  /\bcategory\b/iu,
  /\bkategori\b/iu,
  /\bexecutiveBrain\b/iu,
  /\bexecutive\s+constitution\b/iu,
  /\bconstitution\b/iu,
  /\bexecutive\s+council\b/iu,
  /\bcouncil\b/iu,
  /\bdirector\b/iu,
  /\bCFO\b/u,
  /\bCOO\b/u,
  /\bCHRO\b/u,
  /\bCCO\b/u,
  /\bCMO\b/u,
  /\bsales\s+director\b/iu,
  /\bkonsey\b/iu,
  /\bkurul\b/iu,
  /\banayasa\b/iu,
  /\by[öo]netici\s+anayasas[ıi]\b/iu,
  /\bi[çc]\s+dan[ıi][şs]ma\b/iu,
  /\bi[çc]\s+uzman\b/iu,
  /\bfinans\s+direkt[öo]r[üu]\b/iu,
  /\boperasyon\s+direkt[öo]r[üu]\b/iu,
  /\bsat[ıi][şs]\s+direkt[öo]r[üu]\b/iu,
  /\bpazarlama\s+direkt[öo]r[üu]\b/iu,
  /\bm[üu][şs]teri\s+direkt[öo]r[üu]\b/iu,
  /\binsan\s+kaynaklar[ıi]\s+direkt[öo]r[üu]\b/iu,
  /\bprompt\b/iu,
  /\bsystem\b/iu,
  /\bengine\b/iu,
  /\bteam_size\b/iu,
  /\bindustry\b/iu,
  /\bfact\b/iu,
  /\bfakt(?:lar|[ıi])?\b/iu,
  /\bprocess\s+count\b/iu,
  /\bstrategic\s+direction\b/iu,
  /\bstratejik\s+y[öo]n\b/iu,
  /\bdestek\s+alanlar[ıi]\b/iu,
  /\bcontext\b/iu,
  /\bba[ğg]lam\s+bilgisi\b/iu,
  /\bmevcut\s+ba[ğg]lam\b/iu,
  /\beksik\s+ba[ğg]lam(?:lar)?\b/iu,
  /\bguven:\s*\d/iu,
  /\bg[üu]ven:\s*\d/iu,
  /\bkaynak:\s*\w+/iu,
  /\bCOLLECTION\b/u,
  /\bPRICING\b/u,
  /\bTEAM\b/u,
  /\bGENERAL\b/u,
  /\bPARTIAL\b/u,
  /\bREADY\b/u,
  /\bINSUFFICIENT\b/u,
];

const BUSINESS_TERMS = [
  "müşteri",
  "musteri",
  "ödeme",
  "odeme",
  "tahsilat",
  "satış",
  "satis",
  "nakit",
  "ekip",
  "personel",
  "operasyon",
  "teslimat",
  "teklif",
  "fiyat",
  "ciro",
  "şirket",
  "sirket",
  "hedef",
  "performans",
  "kota",
  "bütçe",
  "butce",
  "rakam",
  "bu ay",
  "ay sonu",
  "geçen ay",
  "gecen ay",
] as const;

const SHORT_BUSINESS_TERMS = ["iş", "is"] as const;

const CASUAL_TERMS = [
  "fenerbahçe",
  "fenerbahce",
  "galatasaray",
  "beşiktaş",
  "besiktas",
  "trabzonspor",
  "maç",
  "mac",
  "futbol",
  "trafik",
  "aile",
  "film",
  "dizi",
  "hava",
  "yemek",
] as const;

const DAILY_BUSINESS_PLANNING_TERMS = [
  "bugun ne yapiyoruz",
  "bugun neler var",
  "bugun ne var",
  "bugun nasil ilerleyelim",
  "gunun plani",
  "bugunku plan",
  "bugun nereden basliyoruz",
  "bugun nereden baslayalim",
  "nereden baslayalim",
  "bugun neyle baslayalim",
  "neyle baslayalim",
  "bugun ilk ne yapalim",
  "ilk ne yapalim",
  "bugun neye odaklanalim",
  "bugun onceligimiz ne",
  "bugun neye bakalim",
  "isler ne durumda",
  "bugun isleri nasil yonetelim",
  "tutacak mi",
  "tutturabilir miyiz",
  "yetisir mi",
  "ne yapayim",
  "bugun ne yapayim",
  "ne onerirsin",
  "peki ne yapayim",
  "bu durumda ne",
  "ne yapmaliyim",
  "nasil devam edelim",
  "nasil ilerliyoruz",
  "peki sonra",
  "peki bu durumda",
  "buradan nasil",
  "ne yapalim simdi",
] as const;

export function sanitizeExecutiveManagerResponse(
  input: SanitizeExecutiveManagerResponseInput,
): ExecutiveManagerSanitizationResult {
  const mode = detectExecutiveResponseMode(input.userMessage);
  const content = normalizeWhitespace(input.content);

  if (!content) {
    return {
      content,
      needsRepair: true,
      reason: "empty_response",
    };
  }

  if (hasTechnicalLeak(content)) {
    return {
      content,
      needsRepair: true,
      reason: "technical_leak",
    };
  }

  const identityValidation = validateExecutivePresenceResponse(content);
  if (!identityValidation.valid) {
    return {
      content,
      needsRepair: true,
      reason: identityValidation.violation,
    };
  }

  const behaviorValidation = validateLivingExecutiveBehavior(
    content,
    resolveLivingExecutiveBehavior({
      userMessage: input.userMessage,
      surface: input.surface ?? "chat",
      hasPriorTurns: input.hasPriorTurns,
      semanticHint: input.semanticHint,
    }),
  );
  if (!behaviorValidation.valid) {
    return { content, needsRepair: true, reason: behaviorValidation.violation };
  }

  if (shouldRepairCasualBusinessDrift(mode, content)) {
    return {
      content,
      needsRepair: true,
      reason: "casual_context_forced_to_business",
    };
  }

  return {
    content,
    needsRepair: false,
  };
}

function detectExecutiveResponseMode(message: string): ExecutiveResponseMode {
  const normalized = normalizeForIntent(message);

  if (
    includesAny(normalized, [
      "beni ne kadar taniyorsun",
      "beni taniyor musun",
      "beni tanidin mi",
      "beni ne kadar biliyorsun",
      "benim hakkimda ne biliyorsun",
    ])
  ) {
    return "personal_reflection";
  }

  if (
    includesAny(normalized, [
      "yoruldum",
      "cok yorgunum",
      "calisasim yok",
      "calismak istemiyorum",
      "canim calismak istemiyor",
      "canim hicbir sey yapmak istemiyor",
      "enerjim yok",
      "modum dusuk",
      "uğrasasim yok",
      "ugrasasim yok",
      "hicbir sey yapmak istemiyorum",
      "bunaldim",
      "stresliyim",
      "moralim bozuk",
    ])
  ) {
    return "emotional_support";
  }

  if (
    includesAny(normalized, [
      "tek hamle",
      "bugun ne yapmaliyim",
      "bugun neye odaklan",
      "en dogru hamle",
      "once ne yap",
      "oncelik",
    ])
  ) {
    return "daily_focus";
  }

  if (includesAny(normalized, DAILY_BUSINESS_PLANNING_TERMS)) {
    return "daily_focus";
  }

  if (includesAny(normalized, CASUAL_TERMS)) {
    return "casual_conversation";
  }

  if (hasBusinessIntent(normalized)) {
    return "business_advice";
  }

  return "business_advice";
}

function hasTechnicalLeak(content: string): boolean {
  return TECHNICAL_LEAK_PATTERNS.some((pattern) => pattern.test(content));
}

function shouldRepairCasualBusinessDrift(
  mode: ExecutiveResponseMode,
  content: string,
): boolean {
  if (mode !== "casual_conversation") {
    return false;
  }

  const normalized = normalizeForIntent(content);

  return includesAny(normalized, [
    "sirket hafizasi",
    "aktif bilgi",
    "baglam bilgisi",
    "hafizamdaki",
  ]);
}

function normalizeWhitespace(content: string): string {
  return content.trim().replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

function normalizeForIntent(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
}

function includesAny(message: string, needles: readonly string[]): boolean {
  return needles.some((needle) => message.includes(normalizeForIntent(needle)));
}

function hasBusinessIntent(message: string): boolean {
  return (
    includesAny(message, BUSINESS_TERMS) ||
    SHORT_BUSINESS_TERMS.some((term) => includesWord(message, term))
  );
}

function includesWord(message: string, word: string): boolean {
  const normalizedWord = normalizeForIntent(word);
  const escapedWord = normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|\\s)${escapedWord}(?:$|\\s)`, "u");

  return pattern.test(message);
}
