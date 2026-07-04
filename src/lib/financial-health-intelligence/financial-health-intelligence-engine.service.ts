import type {
  FinancialHealthLevel,
  CashPressureLevel,
  FinancialHealthConfidence,
  CashPerformanceLevel,
  FinancialHealthIntelligence,
  BuildFinancialHealthIntelligenceInput,
} from "./financial-health-intelligence.types";

const CRITICAL_COVERAGE_RATIO = 0.75;
const HIGH_COVERAGE_RATIO = 1.0;
const MEDIUM_COVERAGE_RATIO = 1.5;

const HIGH_EXPENSE_OVERDUE_RATIO = 0.15;
const HIGH_COLLECTION_OVERDUE_RATIO = 0.25;

const LEVEL_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const RANK_TO_LEVEL = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export function buildFinancialHealthIntelligence(
  input: BuildFinancialHealthIntelligenceInput,
): FinancialHealthIntelligence {
  const now = new Date();

  const monthlyBurnRate =
    input.expenseIntelligence?.monthlyBurnRate ??
    input.expenseContext?.monthlyBurnRate ??
    0;

  const estimatedMonthlyCollections = resolveEstimatedCollections(input);
  const collectionCoverageRatio = computeCoverageRatio(estimatedMonthlyCollections, monthlyBurnRate);

  const cashPressureBase = computeCashPressureFromCoverage(collectionCoverageRatio);
  const cashPressureLevel = escalateCashPressure(cashPressureBase, input);

  const projection = input.forecast?.projection ?? null;
  const monthToDateCashCollection = projection?.monthToDateCashCollection ?? null;
  const lastMonthCashCollection = projection?.lastMonthCashCollection ?? null;
  const cashCollectionGrowthRate = projection?.cashCollectionGrowthRate ?? null;

  const { level: cashPerformanceLevel, score: cashPerformanceScore } = computeCashPerformance(
    monthToDateCashCollection,
    lastMonthCashCollection,
    cashCollectionGrowthRate,
  );

  const financialHealthLevel = computeFinancialHealthLevel(
    cashPressureLevel,
    input.paymentIntelligence?.cashRiskLevel ?? "LOW",
    input.expenseIntelligence?.burnRiskLevel ?? "LOW",
    cashPerformanceLevel,
  );

  const riskWarnings = buildRiskWarnings({
    financialHealthLevel,
    cashPressureLevel,
    collectionCoverageRatio,
    monthlyBurnRate,
    estimatedMonthlyCollections,
    cashPerformanceLevel,
    monthToDateCashCollection,
    lastMonthCashCollection,
    cashCollectionGrowthRate,
    input,
  });

  const recommendedActions = buildRecommendedActions({
    financialHealthLevel,
    cashPressureLevel,
    input,
  });

  const executiveSummary = buildExecutiveSummary({
    financialHealthLevel,
    cashPressureLevel,
    monthlyBurnRate,
    estimatedMonthlyCollections,
    collectionCoverageRatio,
    cashPerformanceLevel,
    monthToDateCashCollection,
    lastMonthCashCollection,
    input,
  });

  const confidence = computeConfidence(input);

  return {
    financialHealthLevel,
    cashPressureLevel,
    collectionCoverageRatio,
    estimatedMonthlyCollections,
    monthlyBurnRate,
    monthToDateCashCollection,
    lastMonthCashCollection,
    cashCollectionGrowthRate,
    cashPerformanceLevel,
    cashPerformanceScore,
    riskWarnings,
    recommendedActions,
    executiveSummary,
    confidence,
    generatedAt: now.toISOString(),
    version: "v2",
  };
}

function resolveEstimatedCollections(input: BuildFinancialHealthIntelligenceInput): number | null {
  if (input.forecast?.projection?.expectedCollection30d != null) {
    return input.forecast.projection.expectedCollection30d;
  }
  if (input.paymentContext != null) {
    const pending = input.paymentContext.totalReceivable - input.paymentContext.totalOverdue;
    return Math.max(0, pending);
  }
  return null;
}

function computeCoverageRatio(
  estimatedCollections: number | null,
  monthlyBurnRate: number,
): number | null {
  if (estimatedCollections === null || monthlyBurnRate <= 0) return null;
  return estimatedCollections / monthlyBurnRate;
}

function computeCashPressureFromCoverage(ratio: number | null): CashPressureLevel {
  if (ratio === null) return "LOW";
  if (ratio < CRITICAL_COVERAGE_RATIO) return "CRITICAL";
  if (ratio < HIGH_COVERAGE_RATIO) return "HIGH";
  if (ratio < MEDIUM_COVERAGE_RATIO) return "MEDIUM";
  return "LOW";
}

function escalateCashPressure(
  base: CashPressureLevel,
  input: BuildFinancialHealthIntelligenceInput,
): CashPressureLevel {
  let rank = LEVEL_RANK[base];

  const collectionOverdueHigh =
    (input.paymentIntelligence?.overdueRatio ?? 0) >= HIGH_COLLECTION_OVERDUE_RATIO;
  const expenseOverdueHigh =
    (input.expenseIntelligence?.overdueRatio ?? 0) >= HIGH_EXPENSE_OVERDUE_RATIO;

  if (collectionOverdueHigh && expenseOverdueHigh) {
    rank = Math.min(3, rank + 1);
  }

  const burnRisk = input.expenseIntelligence?.burnRiskLevel;
  if (burnRisk === "HIGH" || burnRisk === "CRITICAL") {
    rank = Math.min(3, rank + 1);
  }

  return RANK_TO_LEVEL[rank];
}

function computeCashPerformance(
  monthToDateCashCollection: number | null,
  lastMonthCashCollection: number | null,
  cashCollectionGrowthRate: number | null,
): { level: CashPerformanceLevel; score: number | null } {
  if (monthToDateCashCollection === null && lastMonthCashCollection === null) {
    return { level: "UNKNOWN", score: null };
  }

  // Trend'e dayalı skor — birincil sinyal
  if (cashCollectionGrowthRate !== null) {
    if (cashCollectionGrowthRate >= 0.2) return { level: "STRONG", score: cashCollectionGrowthRate };
    if (cashCollectionGrowthRate >= 0) return { level: "STABLE", score: cashCollectionGrowthRate };
    if (cashCollectionGrowthRate >= -0.2) return { level: "SOFT", score: cashCollectionGrowthRate };
    return { level: "WEAK", score: cashCollectionGrowthRate };
  }

  // Trend hesaplanamıyorsa MTD vs lastMonth karşılaştırması
  if (lastMonthCashCollection != null && lastMonthCashCollection > 0 && monthToDateCashCollection != null) {
    const ratio = monthToDateCashCollection / lastMonthCashCollection;
    if (ratio >= 1.2) return { level: "STRONG", score: ratio - 1 };
    if (ratio >= 0.8) return { level: "STABLE", score: ratio - 1 };
    if (ratio >= 0.5) return { level: "SOFT", score: ratio - 1 };
    return { level: "WEAK", score: ratio - 1 };
  }

  return { level: "UNKNOWN", score: null };
}

function computeFinancialHealthLevel(
  cashPressureLevel: CashPressureLevel,
  cashRiskLevel: string,
  burnRiskLevel: string,
  cashPerformanceLevel: CashPerformanceLevel,
): FinancialHealthLevel {
  let maxRank = Math.max(
    LEVEL_RANK[cashPressureLevel] ?? 0,
    LEVEL_RANK[cashRiskLevel] ?? 0,
    LEVEL_RANK[burnRiskLevel] ?? 0,
  );

  // WEAK performance tek başına LOW/STABLE görüntüyü MEDIUM'a çeker
  if (cashPerformanceLevel === "WEAK" && maxRank < LEVEL_RANK["MEDIUM"]) {
    maxRank = LEVEL_RANK["MEDIUM"];
  }

  // WEAK + mevcut risk baskısı varsa HIGH'a katkı verir
  if (
    cashPerformanceLevel === "WEAK" &&
    (LEVEL_RANK[cashPressureLevel] >= LEVEL_RANK["HIGH"] ||
      LEVEL_RANK[cashRiskLevel] >= LEVEL_RANK["HIGH"])
  ) {
    maxRank = Math.min(3, Math.max(maxRank, LEVEL_RANK["HIGH"]));
  }

  return RANK_TO_LEVEL[maxRank];
}

function buildRiskWarnings(ctx: {
  financialHealthLevel: FinancialHealthLevel;
  cashPressureLevel: CashPressureLevel;
  collectionCoverageRatio: number | null;
  monthlyBurnRate: number;
  estimatedMonthlyCollections: number | null;
  cashPerformanceLevel: CashPerformanceLevel;
  monthToDateCashCollection: number | null;
  lastMonthCashCollection: number | null;
  cashCollectionGrowthRate: number | null;
  input: BuildFinancialHealthIntelligenceInput;
}): string[] {
  const warnings: string[] = [];
  const {
    cashPressureLevel,
    collectionCoverageRatio,
    cashPerformanceLevel,
    monthToDateCashCollection,
    lastMonthCashCollection,
    cashCollectionGrowthRate,
    input,
  } = ctx;

  if (cashPressureLevel === "CRITICAL" && collectionCoverageRatio !== null) {
    warnings.push(
      `Nakit baskısı KRİTİK: tahsilat kapasitesi gider yükünün yalnızca %${Math.round(collectionCoverageRatio * 100)}'ini karşılıyor.`,
    );
  } else if (cashPressureLevel === "HIGH" && collectionCoverageRatio !== null) {
    warnings.push(
      `Nakit baskısı YÜKSEK: beklenen tahsilat gider yükünü karşılamıyor (oran: ${collectionCoverageRatio.toFixed(2)}).`,
    );
  }

  const payOverdueHigh =
    (input.paymentIntelligence?.overdueRatio ?? 0) >= HIGH_COLLECTION_OVERDUE_RATIO;
  const expOverdueHigh =
    (input.expenseIntelligence?.overdueRatio ?? 0) >= HIGH_EXPENSE_OVERDUE_RATIO;

  if (payOverdueHigh && expOverdueHigh) {
    warnings.push("Tahsilat gecikmeleri ve gider gecikmeleri aynı anda yüksek — çift taraflı nakit sıkışıklığı riski.");
  }

  const burnRisk = input.expenseIntelligence?.burnRiskLevel;
  if (burnRisk === "CRITICAL") {
    warnings.push("Gider riski KRİTİK — maaş veya vergi ödemesi gecikmiş olabilir.");
  } else if (burnRisk === "HIGH") {
    warnings.push("Gider riski YÜKSEK — gecikmiş gider kalemleri gözlemleniyor.");
  }

  const cashRisk = input.paymentIntelligence?.cashRiskLevel;
  if (cashRisk === "CRITICAL") {
    warnings.push("Tahsilat riski KRİTİK — alacak havuzunun büyük bölümü vadesi geçmiş.");
  } else if (cashRisk === "HIGH") {
    warnings.push("Tahsilat riski YÜKSEK — tahsilat aksiyonu acil önceliğe alınmalı.");
  }

  // Cash performance sinyalleri
  if (cashPerformanceLevel === "WEAK" && cashCollectionGrowthRate !== null) {
    warnings.push(
      `Gerçek tahsilat trendinde belirgin düşüş: geçen aya göre %${Math.abs(Math.round(cashCollectionGrowthRate * 100))} gerileme.`,
    );
  } else if (
    cashPerformanceLevel === "SOFT" &&
    lastMonthCashCollection != null &&
    lastMonthCashCollection > 0 &&
    monthToDateCashCollection != null &&
    monthToDateCashCollection < lastMonthCashCollection * 0.5
  ) {
    warnings.push(
      `Bu ay gerçek tahsilat geçen aya kıyasla ciddi geride: ₺${monthToDateCashCollection.toLocaleString("tr-TR")} / ₺${lastMonthCashCollection.toLocaleString("tr-TR")}.`,
    );
  }

  return warnings.slice(0, 4);
}

function buildRecommendedActions(ctx: {
  financialHealthLevel: FinancialHealthLevel;
  cashPressureLevel: CashPressureLevel;
  input: BuildFinancialHealthIntelligenceInput;
}): string[] {
  const actions: string[] = [];
  const { financialHealthLevel, cashPressureLevel, input } = ctx;

  if (cashPressureLevel === "CRITICAL" || financialHealthLevel === "CRITICAL") {
    actions.push("Bu haftaki tahsilat önceliğini belirle ve en büyük gecikmiş alacak için doğrudan temas kur.");
  }

  if (cashPressureLevel === "HIGH" || cashPressureLevel === "CRITICAL") {
    actions.push("Aylık gider taahhütlerini gözden geçir — ertelenebilir kalemleri tespit et.");
  }

  const burnRisk = input.expenseIntelligence?.burnRiskLevel;
  if (burnRisk === "HIGH" || burnRisk === "CRITICAL") {
    actions.push("Gecikmiş gider kalemlerini önceliklendir — tedarikçi ve yasal risk sınırla.");
  }

  const cashRisk = input.paymentIntelligence?.cashRiskLevel;
  if ((cashRisk === "HIGH" || cashRisk === "CRITICAL") && actions.length < 4) {
    actions.push("Tahsilat yönetimi sürecini bu hafta gözden geçir — açık aksiyon sayısını izle.");
  }

  if (financialHealthLevel === "LOW" && actions.length === 0) {
    actions.push("Finansal sağlık dengeli görünüyor — mevcut tahsilat ve gider takibini sürdür.");
  }

  return actions.slice(0, 4);
}

function buildExecutiveSummary(ctx: {
  financialHealthLevel: FinancialHealthLevel;
  cashPressureLevel: CashPressureLevel;
  monthlyBurnRate: number;
  estimatedMonthlyCollections: number | null;
  collectionCoverageRatio: number | null;
  cashPerformanceLevel: CashPerformanceLevel;
  monthToDateCashCollection: number | null;
  lastMonthCashCollection: number | null;
  input: BuildFinancialHealthIntelligenceInput;
}): string {
  const {
    financialHealthLevel,
    cashPressureLevel,
    monthlyBurnRate,
    collectionCoverageRatio,
    estimatedMonthlyCollections,
    cashPerformanceLevel,
    monthToDateCashCollection,
    lastMonthCashCollection,
  } = ctx;

  const healthLabel: Record<FinancialHealthLevel, string> = {
    LOW: "sağlıklı",
    MEDIUM: "izleme gerektiriyor",
    HIGH: "YÜKSEK RİSK",
    CRITICAL: "KRİTİK",
  };

  const pressureLabel: Record<CashPressureLevel, string> = {
    LOW: "düşük",
    MEDIUM: "orta",
    HIGH: "yüksek",
    CRITICAL: "kritik",
  };

  const parts: string[] = [];

  parts.push(`Finansal sağlık durumu: ${healthLabel[financialHealthLevel]}.`);

  if (collectionCoverageRatio !== null && monthlyBurnRate > 0) {
    const collectStr = estimatedMonthlyCollections != null
      ? `${formatTRY(estimatedMonthlyCollections)} likidite beklentisi`
      : "—";
    parts.push(
      `Aylık gider yükü ${formatTRY(monthlyBurnRate)}, ${collectStr} — kapsama oranı ${collectionCoverageRatio.toFixed(2)}.`,
    );
  } else if (monthlyBurnRate > 0) {
    parts.push(`Aylık tekrar eden gider yükü: ${formatTRY(monthlyBurnRate)}.`);
  }

  parts.push(`Nakit baskısı ${pressureLabel[cashPressureLevel]} seviyede.`);

  // Gerçek tahsilat sinyali — beklentiden ayrı tutularak eklenir
  if (lastMonthCashCollection != null && lastMonthCashCollection > 0) {
    if (cashPerformanceLevel === "STRONG" || cashPerformanceLevel === "STABLE") {
      parts.push(`Gerçek tahsilat temposu destekleyici — geçen ay ${formatTRY(lastMonthCashCollection)} tahsil edildi.`);
    } else if (cashPerformanceLevel === "WEAK") {
      parts.push(`Gerçek tahsilat zayıf — geçen ay ${formatTRY(lastMonthCashCollection)}, bu ay ${monthToDateCashCollection != null ? formatTRY(monthToDateCashCollection) : "—"}.`);
    }
  } else if (monthToDateCashCollection != null && monthToDateCashCollection > 0) {
    parts.push(`Bu ay gerçekleşen tahsilat: ${formatTRY(monthToDateCashCollection)}.`);
  }

  return parts.join(" ");
}

function computeConfidence(input: BuildFinancialHealthIntelligenceInput): FinancialHealthConfidence {
  const hasExpense = input.expenseContext?.hasExpenseData === true;
  const hasPayment =
    (input.paymentContext?.totalReceivable ?? 0) > 0 ||
    (input.paymentContext?.overdueCount ?? 0) > 0;
  const hasForecast = input.forecast != null;

  const signals = [hasExpense, hasPayment, hasForecast].filter(Boolean).length;

  if (signals >= 3) return "HIGH";
  if (signals >= 2) return "MEDIUM";
  return "LOW";
}

function formatTRY(amount: number): string {
  return `₺${amount.toLocaleString("tr-TR")}`;
}
