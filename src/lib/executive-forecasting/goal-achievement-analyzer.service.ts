import { prisma } from "@/lib/core/shared/prisma";
import type { ExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import type { ForecastProjection, ForecastRiskSignal } from "./executive-forecasting.types";

type GoalProjectionFields = Pick<
  ForecastProjection,
  | "monthlyTarget"
  | "monthToDateRevenue"
  | "forecastedMonthEndRevenue"
  | "goalAchievementRate"
  | "goalGap"
  | "monthToDateCashCollection"
  | "lastMonthCashCollection"
  | "cashCollectionGrowthRate"
>;

export async function analyzeGoalAchievement(
  organizationId: string,
  goalIntelligence: ExecutiveGoalIntelligence | null | undefined,
  projection: ForecastProjection | null,
): Promise<{ signal: ForecastRiskSignal | null; projectionFields: GoalProjectionFields }> {
  const empty: GoalProjectionFields = {};

  const monthlyTarget = goalIntelligence?.monthlyRevenueTarget ?? null;
  if (!monthlyTarget) return { signal: null, projectionFields: empty };

  const now = new Date();
  const startOfCurrentMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const startOfLastMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );

  // WON quotes this month — korundu (backward compat)
  const wonQuotes = await prisma.quote.findMany({
    where: {
      organizationId,
      status: "WON",
      wonAt: { gte: startOfCurrentMonth },
    },
    select: { amount: true },
  });

  const monthToDateRevenue = wonQuotes.reduce(
    (sum, q) => sum + Number(q.amount ?? 0),
    0,
  );

  // PAID payments — bu ay tahsilat
  const paidThisMonth = await prisma.payment.findMany({
    where: {
      organizationId,
      status: "PAID",
      paidAt: { gte: startOfCurrentMonth },
    },
    select: { paidAmount: true },
  });

  const monthToDateCashCollection = paidThisMonth.reduce(
    (sum, p) => sum + Number(p.paidAmount ?? 0),
    0,
  );

  // PAID payments — geçen ay tahsilat
  const paidLastMonth = await prisma.payment.findMany({
    where: {
      organizationId,
      status: "PAID",
      paidAt: { gte: startOfLastMonth, lt: startOfCurrentMonth },
    },
    select: { paidAmount: true },
  });

  const lastMonthCashCollection = paidLastMonth.reduce(
    (sum, p) => sum + Number(p.paidAmount ?? 0),
    0,
  );

  const cashCollectionGrowthRate =
    lastMonthCashCollection > 0
      ? (monthToDateCashCollection - lastMonthCashCollection) / lastMonthCashCollection
      : null;

  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const elapsedDays = now.getUTCDate();
  const remainingDays = Math.max(0, daysInMonth - elapsedDays);
  const remainingFraction = remainingDays / daysInMonth;

  const pipelineContribution = projection
    ? projection.expectedRevenue30d * remainingFraction
    : 0;

  const forecastedMonthEndRevenue = monthToDateRevenue + pipelineContribution;
  const goalAchievementRate = forecastedMonthEndRevenue / monthlyTarget;
  const goalGap = Math.max(0, monthlyTarget - forecastedMonthEndRevenue);

  const projectionFields: GoalProjectionFields = {
    monthlyTarget,
    monthToDateRevenue,
    forecastedMonthEndRevenue,
    goalAchievementRate,
    goalGap,
    monthToDateCashCollection,
    lastMonthCashCollection,
    cashCollectionGrowthRate,
  };

  const signal = buildGoalGapSignal(
    monthlyTarget,
    monthToDateRevenue,
    forecastedMonthEndRevenue,
    goalAchievementRate,
    goalGap,
    monthToDateCashCollection,
    lastMonthCashCollection,
    cashCollectionGrowthRate,
  );

  return { signal, projectionFields };
}

function buildGoalGapSignal(
  monthlyTarget: number,
  monthToDateRevenue: number,
  forecastedMonthEndRevenue: number,
  achievementRate: number,
  goalGap: number,
  monthToDateCashCollection: number,
  lastMonthCashCollection: number,
  cashCollectionGrowthRate: number | null,
): ForecastRiskSignal | null {
  if (goalGap <= 0 || achievementRate >= 0.9) return null;

  const riskLevel = achievementRate < 0.75 ? "HIGH" : "WATCH";
  const ratePct = Math.round(achievementRate * 100);
  const gapFormatted = goalGap.toLocaleString("tr-TR");
  const targetFormatted = monthlyTarget.toLocaleString("tr-TR");
  const forecastFormatted = forecastedMonthEndRevenue.toLocaleString("tr-TR");
  const cashCollectionFormatted = monthToDateCashCollection.toLocaleString("tr-TR");
  const lastMonthFormatted = lastMonthCashCollection.toLocaleString("tr-TR");

  const growthLine =
    cashCollectionGrowthRate !== null
      ? ` Tahsilat değişimi: %${Math.round(cashCollectionGrowthRate * 100)}.`
      : "";

  return {
    riskType: "GOAL_GAP",
    riskLevel,
    confidence: "MEDIUM",
    confidenceScore: 0.62,
    headline:
      riskLevel === "HIGH"
        ? `Hedef açığı kritik: ay sonu tahmini ₺${forecastFormatted}, hedefe ₺${gapFormatted} eksik (%${ratePct}).`
        : `Hedef takipte: ay sonu tahmininde %${ratePct} gerçekleşme bekleniyor.`,
    explanation:
      `Aylık hedef ₺${targetFormatted}. Bu ayki kazanılan teklif cirosu: ₺${monthToDateRevenue.toLocaleString("tr-TR")}. ` +
      `Pipeline katkısıyla ay sonu tahmini ₺${forecastFormatted} (%${ratePct}). ` +
      `Bu ay gerçek tahsilat: ₺${cashCollectionFormatted}. Geçen ay tahsilat: ₺${lastMonthFormatted}.${growthLine}`,
    actionableStep:
      riskLevel === "HIGH"
        ? `Hedefe ulaşmak için ₺${gapFormatted} ek gelir gerekiyor; pipeline'daki en yüksek olasılıklı teklifleri hızlandır.`
        : null,
    evidence: [
      {
        dataPoint: "Aylık gelir hedefi",
        value: `₺${targetFormatted}`,
        source: "memory",
      },
      {
        dataPoint: "Bu ay kazanılan teklif cirosu (WON)",
        value: `₺${monthToDateRevenue.toLocaleString("tr-TR")}`,
        source: "quote",
      },
      {
        dataPoint: "Ay sonu gelir tahmini",
        value: `₺${forecastFormatted} (%${ratePct})`,
        source: "quote",
      },
      {
        dataPoint: "Bu ay gerçek tahsilat (PAID)",
        value: `₺${cashCollectionFormatted}`,
        source: "payment",
      },
      {
        dataPoint: "Geçen ay tahsilat (PAID)",
        value: `₺${lastMonthFormatted}`,
        source: "payment",
      },
    ],
    dataLimitations: [
      ...(monthToDateRevenue === 0 ? ["Bu ay henüz kazanılmış teklif kaydı yok."] : []),
      ...(monthToDateCashCollection === 0 ? ["Bu ay henüz tahsil edilmiş ödeme kaydı yok."] : []),
    ],
  };
}
