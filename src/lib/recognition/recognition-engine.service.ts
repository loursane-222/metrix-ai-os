import type {
  BusinessProfileJson,
  OnboardingAnswers,
  RecognitionInsight,
  RecognitionProfileJson,
} from "./recognition-engine.types";

const DEFAULT_INDUSTRY = "Genel";
const DEFAULT_TEAM_SIZE = "Belirtilmedi";
const DEFAULT_BUSINESS_TYPE = "Operasyonel işletme";
const RECOGNITION_INSIGHT_VERSION = "1.0.0";

export function buildBusinessProfile(
  answers: OnboardingAnswers,
): BusinessProfileJson {
  return {
    answers,
    updatedAt: new Date().toISOString(),
  };
}

export function buildRecognitionProfile(
  answers: OnboardingAnswers,
): RecognitionProfileJson {
  const industry = cleanValue(answers.industry) ?? DEFAULT_INDUSTRY;
  const teamSize = cleanValue(answers.teamSize ?? answers.teamStructure) ?? DEFAULT_TEAM_SIZE;
  const businessType = cleanValue(answers.businessType) ?? inferBusinessType(industry);
  const mainChallenge = cleanValue(answers.mainChallenge);
  const firstGoal = cleanValue(answers.firstGoal);
  const priorities = buildPriorities(mainChallenge, firstGoal);
  const risks = buildRisks(mainChallenge, teamSize);
  const recommendedFirstSetupStep = buildRecommendedFirstSetupStep(
    mainChallenge,
    firstGoal,
  );
  const insight = buildRecognitionInsight({
    industry,
    teamSize,
    businessType,
    mainChallenge,
    firstGoal,
    priorities,
    risks,
    recommendedFirstSetupStep,
  });

  return {
    industry,
    teamSize,
    businessType,
    priorities,
    risks,
    recommendedFirstSetupStep,
    summary: `${industry} alanında çalışan ${teamSize} yapısında bir işletme. İlk odak: ${recommendedFirstSetupStep}.`,
    insight,
  };
}

export function buildRecognitionInsight(input: {
  industry: string;
  teamSize: string;
  businessType: string;
  mainChallenge: string | undefined;
  firstGoal: string | undefined;
  priorities: string[];
  risks: string[];
  recommendedFirstSetupStep: string;
}): RecognitionInsight {
  const operationalPriority =
    input.firstGoal ?? input.priorities[0] ?? "İlk operasyonel hedefi netleştirmek";
  const mainBottleneck =
    input.mainChallenge ?? "Bilginin ve takip sorumluluklarının dağınık kalması";
  const recommendedFirstModule = inferRecommendedFirstModule(
    input.mainChallenge,
    input.firstGoal,
  );

  return {
    headline: `${input.businessType} için ilk odak ${operationalPriority}.`,
    businessType: input.businessType,
    operationalPriority,
    mainBottleneck,
    recommendedFirstModule,
    sevenDayPlan: buildSevenDayPlan({
      operationalPriority,
      mainBottleneck,
      recommendedFirstModule,
    }),
    riskWarnings: input.risks,
    nextBestActions: buildNextBestActions({
      operationalPriority,
      mainBottleneck,
      recommendedFirstSetupStep: input.recommendedFirstSetupStep,
    }),
    confidence: calculateConfidence(input),
    generatedBy: "deterministic",
    version: RECOGNITION_INSIGHT_VERSION,
  };
}

function cleanValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function inferBusinessType(industry: string): string {
  const normalized = industry.toLocaleLowerCase("tr-TR");

  if (
    normalized.includes("satis") ||
    normalized.includes("satış") ||
    normalized.includes("perakende")
  ) {
    return "Satış odaklı işletme";
  }

  if (
    normalized.includes("hizmet") ||
    normalized.includes("danisman") ||
    normalized.includes("danışman")
  ) {
    return "Hizmet odaklı işletme";
  }

  if (
    normalized.includes("uretim") ||
    normalized.includes("üretim") ||
    normalized.includes("imalat")
  ) {
    return "Operasyon ve üretim odaklı işletme";
  }

  return DEFAULT_BUSINESS_TYPE;
}

function buildPriorities(
  mainChallenge: string | undefined,
  firstGoal: string | undefined,
): string[] {
  const priorities = [
    firstGoal ?? "İlk iş hedefini netleştirmek",
    mainChallenge ?? "Operasyonel görünürlüğü artırmak",
    "Şirket hafızasını düzenli toplamaya başlamak",
  ];

  return uniqueValues(priorities).slice(0, 3);
}

function buildRisks(
  mainChallenge: string | undefined,
  teamSize: string,
): string[] {
  const risks = [
    mainChallenge
      ? `${mainChallenge} alanında tekrar eden bilgi kaybı`
      : "Süreçlerin kişilere bağımlı kalması",
  ];

  if (teamSize !== DEFAULT_TEAM_SIZE) {
    risks.push("Ekip büyüdükçe karar ve takip bilgisinin dağılması");
  }

  risks.push("Önceliklerin tek bir yerde görünmemesi");

  return uniqueValues(risks).slice(0, 3);
}

function buildRecommendedFirstSetupStep(
  mainChallenge: string | undefined,
  firstGoal: string | undefined,
): string {
  if (firstGoal) {
    return `${firstGoal} hedefi için ilk takip panosunu kur`;
  }

  if (mainChallenge) {
    return `${mainChallenge} konusunu haftalık takip akışı olarak tanımla`;
  }

  return "İlk iş hedefini ve haftalık takip ritmini tanımla";
}

function inferRecommendedFirstModule(
  mainChallenge: string | undefined,
  firstGoal: string | undefined,
): string {
  const text = `${mainChallenge ?? ""} ${firstGoal ?? ""}`.toLocaleLowerCase(
    "tr-TR",
  );

  if (
    text.includes("musteri") ||
    text.includes("müşteri") ||
    text.includes("satis") ||
    text.includes("satış")
  ) {
    return "Müşteri ve satış takip modülü";
  }

  if (text.includes("teklif")) {
    return "Teklif ve takip modülü";
  }

  if (
    text.includes("ekip") ||
    text.includes("gorev") ||
    text.includes("görev")
  ) {
    return "Ekip görev ve ritim modülü";
  }

  if (
    text.includes("stok") ||
    text.includes("uretim") ||
    text.includes("üretim")
  ) {
    return "Operasyon takip modülü";
  }

  return "İş hafızası ve haftalık takip modülü";
}

function buildSevenDayPlan(input: {
  operationalPriority: string;
  mainBottleneck: string;
  recommendedFirstModule: string;
}) {
  return [
    {
      phase: "Gün 1-2",
      title: "İşletme hafızasını toparla",
      action: `${input.mainBottleneck} konusundaki mevcut notları ve sorumluları tek yerde topla.`,
    },
    {
      phase: "Gün 3-4",
      title: "İlk takip alanını kur",
      action: `${input.recommendedFirstModule} için temel kayıt alanlarını tanımla.`,
    },
    {
      phase: "Gün 5-7",
      title: "Haftalık ritmi başlat",
      action: `${input.operationalPriority} hedefi için haftalık kontrol ve karar ritmini kur.`,
    },
  ];
}

function buildNextBestActions(input: {
  operationalPriority: string;
  mainBottleneck: string;
  recommendedFirstSetupStep: string;
}): string[] {
  return [
    input.recommendedFirstSetupStep,
    `${input.mainBottleneck} için sorumlu kişi veya ekip belirle`,
    `${input.operationalPriority} hedefini haftalık ölçülebilir bir takip maddesine çevir`,
  ];
}

function calculateConfidence(input: {
  industry: string;
  teamSize: string;
  mainChallenge: string | undefined;
  firstGoal: string | undefined;
}): number {
  let confidence = 45;

  if (input.industry !== DEFAULT_INDUSTRY) {
    confidence += 15;
  }

  if (input.teamSize !== DEFAULT_TEAM_SIZE) {
    confidence += 15;
  }

  if (input.mainChallenge) {
    confidence += 15;
  }

  if (input.firstGoal) {
    confidence += 10;
  }

  return Math.min(confidence, 95);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}
