import type { ManagerAdviceAnalysis } from "./manager-advice-orchestrator.types";

type DetectExecutiveGapInput = {
  message: string;
  analysis: ManagerAdviceAnalysis;
};

export type ExecutiveGapDetectionResult =
  | { hasGap: false }
  | { hasGap: true; criticalQuestion: string; reason: string };

const DECISION_GOAL_PATTERNS: readonly string[] = [
  "hedef tutacak mi",
  "hedefe ulaşır miyiz",
  "hedefe ulasir miyiz",
  "yetisir mi",
  "bu ay nasil gidiyor",
  "satis iyi mi",
  "tahsilat riski var mi",
  "karli miyiz",
  "personel yeterli mi",
  "yeterlimiyiz",
  "bu ay tutacak mi",
  "bu ay tutturabilir miyiz",
  "ay sonu tutacak mi",
  "ay sonu tutturabilir miyiz",
  "hedefe varir miyiz",
  "rakamlar nasil",
  "nasil gidiyoruz",
  "gidebilir miyiz",
];

const GAP_SAFE_FALLBACK =
  "Buna şu an net karar vermeyelim. Önce baz alacağımız temel veriyi netleştirelim: Bu konuda mevcut en güvenilir sayımız nedir?";

export function detectExecutiveGap(
  input: DetectExecutiveGapInput,
): ExecutiveGapDetectionResult {
  const canInspectGap =
    input.analysis.readiness === "INSUFFICIENT" ||
    input.analysis.readiness === "PARTIAL";

  if (!canInspectGap) {
    return { hasGap: false };
  }

  const normalized = normalizeForIntent(input.message);

  if (!isDecisionOrGoalQuestion(normalized)) {
    return { hasGap: false };
  }

  const criticalQuestion = resolveCriticalQuestion(normalized, input.analysis.category);

  return {
    hasGap: true,
    criticalQuestion,
    reason: `readiness:INSUFFICIENT category:${input.analysis.category}`,
  };
}

export function getGapSafeFallback(): string {
  return GAP_SAFE_FALLBACK;
}

function isDecisionOrGoalQuestion(normalizedMessage: string): boolean {
  return DECISION_GOAL_PATTERNS.some((pattern) =>
    normalizedMessage.includes(normalizeForIntent(pattern)),
  );
}

function resolveCriticalQuestion(
  normalizedMessage: string,
  category: string,
): string {
  if (isCollectionRelated(normalizedMessage, category)) {
    return "Tahsilat riskini net söyleyebilmem için önce açık alacak düzenimizi kurmamız gerekiyor. Şu an vadesi geçmiş yaklaşık toplam alacağımız ne kadar?";
  }

  if (isProfitabilityRelated(normalizedMessage, category)) {
    return "Kârlılığı net okuyabilmem için önce gelir ve maliyet tarafını aynı zemine koymamız gerekiyor. Bu ay yaklaşık cironuz ve ana maliyetiniz ne seviyede?";
  }

  if (isTeamRelated(normalizedMessage, category)) {
    return "Personel yeterliliğini net değerlendirebilmem için önce mevcut ekibi bilmem gerekiyor. Şu anda aktif çalışan kaç kişi var?";
  }

  return "Hangi hedefi baz aldığımızı bilmiyorum. Bu şirket için aylık hedef mekanizmasını henüz kurmadık. Önce geçen ay yaklaşık cironuz ne kadardı?";
}

function isCollectionRelated(normalizedMessage: string, category: string): boolean {
  if (category === "COLLECTION" || category === "CASHFLOW") return true;
  return ["tahsilat", "alacak", "borc", "odeme", "vadesi"].some((term) =>
    normalizedMessage.includes(term),
  );
}

function isProfitabilityRelated(normalizedMessage: string, _category: string): boolean {
  return (
    normalizedMessage.includes("karli") ||
    normalizedMessage.includes("kar") ||
    normalizedMessage.includes("maliyet") ||
    normalizedMessage.includes("gelir")
  );
}

function isTeamRelated(normalizedMessage: string, category: string): boolean {
  if (category === "TEAM" || category === "HIRING") return true;
  return ["personel", "ekip", "calisan", "yeterli"].some((term) =>
    normalizedMessage.includes(term),
  );
}

function normalizeForIntent(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}
