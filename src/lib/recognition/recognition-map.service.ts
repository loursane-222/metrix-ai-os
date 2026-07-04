import type {
  BusinessProfile,
  RecognitionProfile,
} from "./recognition-engine.types";
import type {
  RecognitionMapItem,
  RecognitionMapResult,
} from "./recognition-map.types";

const RECOGNITION_MAP_VERSION = "1.0.0";

export function buildRecognitionMapResult(input: {
  businessProfile: BusinessProfile | null;
  recognitionProfile: RecognitionProfile | null;
}): RecognitionMapResult | null {
  if (!input.businessProfile || !input.recognitionProfile) {
    return null;
  }

  const learnedFromUser = buildLearnedFromUser(input.businessProfile);
  const inferredAboutBusiness = buildInferredAboutBusiness(
    input.recognitionProfile,
  );
  const assumptions = buildAssumptions(input.recognitionProfile);
  const priorities = buildPriorities(input.recognitionProfile);
  const riskSignals = buildRiskSignals(input.recognitionProfile);

  return {
    learnedFromUser,
    inferredAboutBusiness,
    assumptions,
    priorities,
    riskSignals,
    confidence: input.recognitionProfile.insight.confidence,
    generatedBy: "deterministic",
    version: RECOGNITION_MAP_VERSION,
  };
}

function buildLearnedFromUser(
  businessProfile: BusinessProfile,
): RecognitionMapItem[] {
  const answers = businessProfile.answers;

  return compactItems([
    answers.industry
      ? buildItem({
          label: "Sektor",
          value: answers.industry,
          confidence: 95,
          isAssumption: false,
        })
      : null,
    answers.teamSize ?? answers.teamStructure
      ? buildItem({
          label: "Ekip yapisi",
          value: answers.teamSize ?? answers.teamStructure ?? "",
          confidence: 95,
          isAssumption: false,
        })
      : null,
    answers.mainChallenge
      ? buildItem({
          label: "Zorlanilan konu",
          value: answers.mainChallenge,
          confidence: 95,
          isAssumption: false,
        })
      : null,
    answers.firstGoal
      ? buildItem({
          label: "Ilk hedef",
          value: answers.firstGoal,
          confidence: 95,
          isAssumption: false,
        })
      : null,
  ]);
}

function buildInferredAboutBusiness(
  recognitionProfile: RecognitionProfile,
): RecognitionMapItem[] {
  const confidence = recognitionProfile.insight.confidence;

  return [
    buildItem({
      label: "Isletme tipi",
      value: recognitionProfile.businessType,
      confidence,
      isAssumption: true,
    }),
    buildItem({
      label: "Tanima ozeti",
      value: recognitionProfile.summary,
      confidence,
      isAssumption: true,
    }),
    buildItem({
      label: "Ilk kurulum adimi",
      value: recognitionProfile.recommendedFirstSetupStep,
      confidence,
      isAssumption: true,
    }),
  ];
}

function buildAssumptions(
  recognitionProfile: RecognitionProfile,
): RecognitionMapItem[] {
  const insight = recognitionProfile.insight;

  return [
    buildItem({
      label: "Ana darbogaz",
      value: insight.mainBottleneck,
      confidence: insight.confidence,
      isAssumption: true,
    }),
    buildItem({
      label: "Onerilen ilk modul",
      value: insight.recommendedFirstModule,
      confidence: insight.confidence,
      isAssumption: true,
    }),
  ];
}

function buildPriorities(
  recognitionProfile: RecognitionProfile,
): RecognitionMapItem[] {
  const insight = recognitionProfile.insight;
  const priorityItems = [
    buildItem({
      label: "Ana oncelik",
      value: insight.operationalPriority,
      confidence: insight.confidence,
      isAssumption: true,
    }),
    buildItem({
      label: "Onerilen modul",
      value: insight.recommendedFirstModule,
      confidence: insight.confidence,
      isAssumption: true,
    }),
  ];

  return priorityItems.concat(
    insight.nextBestActions.slice(0, 3).map((action, index) =>
      buildItem({
        label: `Sonraki adim ${index + 1}`,
        value: action,
        confidence: insight.confidence,
        isAssumption: true,
      }),
    ),
  );
}

function buildRiskSignals(
  recognitionProfile: RecognitionProfile,
): RecognitionMapItem[] {
  return recognitionProfile.insight.riskWarnings.slice(0, 3).map((risk, index) =>
    buildItem({
      label: `Risk sinyali ${index + 1}`,
      value: risk,
      confidence: recognitionProfile.insight.confidence,
      isAssumption: true,
    }),
  );
}

function buildItem(input: {
  label: string;
  value: string;
  confidence: number;
  isAssumption: boolean;
}): RecognitionMapItem {
  return {
    label: input.label,
    value: input.value,
    source: "onboarding",
    confidence: input.confidence,
    isAssumption: input.isAssumption,
  };
}

function compactItems(
  items: Array<RecognitionMapItem | null>,
): RecognitionMapItem[] {
  return items.filter((item): item is RecognitionMapItem => item !== null);
}
