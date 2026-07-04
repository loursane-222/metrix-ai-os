import type {
  ActionEngineResult,
  ActionRecommendation,
} from "@/lib/actions/action-engine.types";
import type { RecognitionProfile } from "@/lib/recognition/recognition-engine.types";

import type {
  ActionExplanation,
  GuidedActionResult,
} from "./guided-action-engine.types";

const GUIDED_ACTION_ENGINE_VERSION = "1.0.0";

export function buildGuidedActionResult(input: {
  recognitionProfile: RecognitionProfile | null;
  actionEngineResult: ActionEngineResult | null;
}): GuidedActionResult | null {
  if (!input.recognitionProfile || !input.actionEngineResult) {
    return null;
  }

  const recognitionProfile = input.recognitionProfile;
  const actionEngineResult = input.actionEngineResult;
  const explanations = actionEngineResult.recommendedActions.map((action) =>
    buildActionExplanation({
      action,
      recognitionProfile,
    }),
  );

  return {
    topActionExplanation:
      explanations.find(
        (explanation) => explanation.actionId === actionEngineResult.topAction.id,
      ) ?? explanations[0],
    recommendedActionExplanations: explanations,
    generatedBy: "deterministic",
    version: GUIDED_ACTION_ENGINE_VERSION,
  };
}

function buildActionExplanation(input: {
  action: ActionRecommendation;
  recognitionProfile: RecognitionProfile;
}): ActionExplanation {
  const { action, recognitionProfile } = input;
  const insight = recognitionProfile.insight;
  const primaryRisk =
    insight.riskWarnings[0] ?? "Onceliklerin tek yerde gorunmemesi";
  const confidence = calculateExplanationConfidence({
    actionPriorityScore: action.priorityScore,
    recognitionConfidence: insight.confidence,
  });

  return {
    actionId: action.id,
    summary: `${action.title} oncelikli gorunuyor; cunku ${insight.operationalPriority} hedefi ile ${insight.mainBottleneck} darbogazi ayni noktada bulusuyor.`,
    whyNow: buildWhyNow(action),
    evidence: buildEvidence({
      action,
      mainBottleneck: insight.mainBottleneck,
      operationalPriority: insight.operationalPriority,
      primaryRisk,
    }),
    expectedOutcome: buildExpectedOutcome(action),
    confidence,
    generatedBy: "deterministic",
    version: GUIDED_ACTION_ENGINE_VERSION,
  };
}

function buildWhyNow(action: ActionRecommendation): string {
  if (action.urgencyScore >= 8) {
    return `Bu adim bugun one cikiyor; aciliyet skoru ${action.urgencyScore}/10 ve beklemek takip bilgisini daha da dagitabilir.`;
  }

  if (action.impactScore >= 8) {
    return `Bu adim simdi degerli; etki skoru ${action.impactScore}/10 ve erken kurulum sonraki aksiyonlari daha net hale getirir.`;
  }

  return `Bu adim dusuk eforla ilerleme saglar; efor skoru ${action.effortScore}/10 ve oncelik skoru ${action.priorityScore}/10.`;
}

function buildEvidence(input: {
  action: ActionRecommendation;
  mainBottleneck: string;
  operationalPriority: string;
  primaryRisk: string;
}): string[] {
  return [
    `Operasyonel oncelik: ${input.operationalPriority}`,
    `Ana darbogaz: ${input.mainBottleneck}`,
    `Risk sinyali: ${input.primaryRisk}`,
    `Skorlar: etki ${input.action.impactScore}/10, aciliyet ${input.action.urgencyScore}/10, efor ${input.action.effortScore}/10, oncelik ${input.action.priorityScore}/10`,
  ];
}

function buildExpectedOutcome(action: ActionRecommendation): string {
  if (action.actionType === "SETUP") {
    return `${action.module} kurulunca ilk calisma alani netlesir ve sonraki takipler tek yerde toplanmaya baslar.`;
  }

  if (action.actionType === "CREATE") {
    return "Olculebilir takip maddeleri olusur ve haftalik kontrol ritmi daha gorunur hale gelir.";
  }

  if (action.actionType === "REVIEW") {
    return "Ilk riskler gorunur olur; kullanici son karari vermeden once zayif noktalari kontrol eder.";
  }

  if (action.actionType === "CONFIGURE") {
    return "Calisma ritmi netlesir; tekrar eden karar ve kontrol noktalari daha az kisilere bagimli kalir.";
  }

  return "Bu adim tamamlandiginda siradaki aksiyonlar daha net ve uygulanabilir hale gelir.";
}

function calculateExplanationConfidence(input: {
  actionPriorityScore: number;
  recognitionConfidence: number;
}): number {
  const score =
    input.recognitionConfidence * 0.7 + input.actionPriorityScore * 10 * 0.3;

  return Math.round(Math.min(95, Math.max(45, score)));
}
