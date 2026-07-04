// ─── Executive Question Engine V1 ─────────────────────────────────────────────
//
// ExecutiveCuriosity → öğrenilmesi gereken bilgi için soru üretir.
// Kullanıcıya soru sormaz. Sadece soru objesi üretir.
// Prisma import yok. DB çağrısı yok. async yok. Saf hesaplama.

import type { LearningTarget } from "@/lib/executive-curiosity";

import type {
  BuildExecutiveQuestionInput,
  CuriosityReadinessGrade,
  ExecutiveQuestion,
  ExecutiveQuestionMode,
  GapTier,
} from "./executive-question-engine.types";

export function buildExecutiveQuestion(
  input: BuildExecutiveQuestionInput,
): ExecutiveQuestion {
  const { curiosity } = input;
  const { isCurious, topLearningTarget, readinessGrade, isBlind } = curiosity;

  const empty = emptyQuestion(readinessGrade);

  if (!isCurious || !topLearningTarget) return empty;
  if (readinessGrade === "A") return empty;

  const mode = resolveMode(readinessGrade);
  const primary = buildPrimaryQuestion(topLearningTarget, readinessGrade, isBlind);
  const fallback = buildFallbackQuestion(topLearningTarget, readinessGrade);
  const urgencySignal = buildUrgencySignal(topLearningTarget, readinessGrade, isBlind);

  return {
    generatedAt: new Date().toISOString(),
    targetKey: topLearningTarget.key,
    targetLabel: topLearningTarget.label,
    tier: topLearningTarget.tier,
    mode,
    primaryQuestion: primary,
    fallbackQuestion: fallback,
    urgencySignal,
    readinessGrade,
    shouldAsk: true,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyQuestion(readinessGrade: CuriosityReadinessGrade): ExecutiveQuestion {
  return {
    generatedAt: new Date().toISOString(),
    targetKey: "",
    targetLabel: "",
    tier: "LOW",
    mode: "DIRECT",
    primaryQuestion: "",
    fallbackQuestion: "",
    urgencySignal: "",
    readinessGrade,
    shouldAsk: false,
  };
}

function resolveMode(grade: CuriosityReadinessGrade): ExecutiveQuestionMode {
  if (grade === "B") return "INLINE";
  return "DIRECT";
}

function buildPrimaryQuestion(
  target: LearningTarget,
  grade: CuriosityReadinessGrade,
  isBlind: boolean,
): string {
  const base = target.suggestedQuestion;

  if (isBlind || grade === "F") {
    return `Size daha iyi destek verebilmem için bu bilgiye ihtiyacım var: ${base}`;
  }

  if (grade === "D") {
    return `Önemli bir bilgi eksikliği var — ${base}`;
  }

  if (grade === "C") {
    return base;
  }

  // grade B → INLINE, yumuşak
  return `Bu arada, ${decapitalize(base)}`;
}

function buildFallbackQuestion(
  target: LearningTarget,
  grade: CuriosityReadinessGrade,
): string {
  const label = target.label;

  if (grade === "F" || grade === "D") {
    return `${label} hakkında kısaca bilgi verebilir misiniz?`;
  }

  if (grade === "C") {
    return `${label} konusunu biraz açar mısınız?`;
  }

  // grade B
  return `${label} ile ilgili bir şey sormak istiyordum — uygun mu?`;
}

function buildUrgencySignal(
  target: LearningTarget,
  grade: CuriosityReadinessGrade,
  isBlind: boolean,
): string {
  if (isBlind) {
    return `Kritik bilgi eksik (${target.tier}): ${target.reason} Kör analiz riski yüksek.`;
  }

  const tierLabel = tierToLabel(target.tier);
  return `${tierLabel} öncelikli eksik: ${target.reason}`;
}

function tierToLabel(tier: GapTier): string {
  switch (tier) {
    case "CRITICAL": return "Kritik";
    case "HIGH":     return "Yüksek";
    case "MEDIUM":   return "Orta";
    case "LOW":      return "Düşük";
  }
}

function decapitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}
