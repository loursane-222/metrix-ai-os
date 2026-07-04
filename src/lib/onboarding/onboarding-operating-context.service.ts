import { buildExecutiveAwareness } from "@/lib/executive-awareness";
import { buildExecutiveFocus } from "@/lib/executive-focus";
import { buildExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import { buildExecutiveNarrative } from "@/lib/executive-narrative";
import { buildMemoryContextForOrganization } from "@/lib/memory/memory-context-builder.service";

import {
  ONBOARDING_MISSING_STEPS,
  buildOnboardingAwarenessInput,
  buildOnboardingDiscoverySignal,
  buildOnboardingGoalSignals,
  buildOnboardingRiskSignals,
} from "./onboarding-awareness-adapter.service";
import type {
  BuildOnboardingOperatingContextInput,
  FirstExecutiveDecision,
  OnboardingDiscoverySignal,
  OnboardingExecutiveAssessment,
  OnboardingGoalSignal,
} from "./onboarding-operating-context.types";
import type { ExecutiveFocus, ExecutiveFocusArea } from "@/lib/executive-focus";
import type { ExecutiveNarrative } from "@/lib/executive-narrative";

export async function buildOnboardingOperatingContext(
  input: BuildOnboardingOperatingContextInput,
): Promise<OnboardingExecutiveAssessment> {
  const { organizationId, businessProfile, recognitionProfile, discoveryAnalysis } = input;

  const memoryContext = await buildMemoryContextForOrganization({ organizationId });
  const goalIntelligence = buildExecutiveGoalIntelligence(memoryContext);

  const riskSignals = buildOnboardingRiskSignals(recognitionProfile);
  const goalSignals = buildOnboardingGoalSignals(businessProfile, recognitionProfile);
  const discoverySignal = buildOnboardingDiscoverySignal(discoveryAnalysis);

  const awarenessInput = buildOnboardingAwarenessInput(organizationId);
  const awareness = buildExecutiveAwareness(awarenessInput);

  const narrative = buildExecutiveNarrative({
    organizationId,
    executiveAwareness: awareness,
    failedSteps: [...ONBOARDING_MISSING_STEPS],
  });

  const focus = buildExecutiveFocus({
    organizationId,
    executiveAwareness: awareness,
    executiveNarrative: narrative,
    failedSteps: [...ONBOARDING_MISSING_STEPS],
  });

  const firstExecutiveDecision = buildFirstExecutiveDecision({
    focus,
    discoverySignal,
    narrative,
    goalSignals,
  });

  return {
    generatedAt: new Date().toISOString(),
    onboardingMode: true,
    organizationId,
    confidence: "LOW",
    awareness,
    narrative,
    focus,
    goalIntelligence,
    memoryContext,
    riskSignals,
    goalSignals,
    discoverySignal,
    firstExecutiveDecision,
    activatedMemoryCount: memoryContext.totalIncluded,
    missingDataSteps: [...ONBOARDING_MISSING_STEPS],
  };
}

const FIRST_DECISION_TITLE: Record<ExecutiveFocusArea, string> = {
  DATA_QUALITY: "Veri kaynaklarini tamamla ve yonetim gorunurlugunu kur",
  GENERAL_CONTROL: "Nakit, satis ve tahsilat basliklarini genel kontrol turundan gecir",
  CASH: "Nakit durumunu yonetim onceligi olarak takibe al",
  COLLECTION: "Tahsilat takibini yonetim sistemine bagla",
  SALES: "Satis boru hattini ve teklif kalitesini netlestir",
  EXECUTION: "Sahiplik ve teslim tarihlerini yonetim sistemine al",
  DECISION_FOLLOW_UP: "Acik kararlari takip sistemine bagla",
  MARKET: "Piyasa etkisini yonetim radarinda tut",
};

function buildFirstExecutiveDecision(input: {
  focus: ExecutiveFocus;
  discoverySignal: OnboardingDiscoverySignal | null;
  narrative: ExecutiveNarrative;
  goalSignals: OnboardingGoalSignal[];
}): FirstExecutiveDecision | null {
  const primary = input.focus.primaryFocus;

  if (!primary) return null;

  const firstAction =
    input.narrative.firstAttention?.trim() || primary.firstMove;

  const supportingActions = uniqueStrings([
    ...(input.discoverySignal?.focusItems ?? []),
    input.focus.secondaryFocus?.firstMove ?? null,
  ]).slice(0, 3);

  const goalContext = input.goalSignals[0]?.value.trim() ?? null;
  const rationale = goalContext
    ? `${primary.reason} Birincil hedef: ${goalContext}.`
    : primary.reason;

  return {
    category: primary.focusArea,
    title: FIRST_DECISION_TITLE[primary.focusArea],
    rationale,
    firstAction,
    supportingActions,
    confidence: primary.confidence,
    isFallback: primary.focusLevel === "NORMAL",
  };
}

function uniqueStrings(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized) continue;
    const key = normalized.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}
