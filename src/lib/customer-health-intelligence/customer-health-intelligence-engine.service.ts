import { prisma } from "@/lib/core/shared/prisma";
import { buildCustomerPortfolioIntelligence } from "@/lib/customer-portfolio-intelligence";
import type { CustomerPortfolioIntelligence, CustomerProfile } from "@/lib/customer-portfolio-intelligence";
import type {
  CustomerHealthProfile,
  CustomerHealthLabel,
  CustomerHealthConfidence,
  CustomerHealthRecommendedAction,
  CustomerHealthIntelligence,
  CustomerHealthDistribution,
  CustomerHealthPaymentHealth,
  CustomerHealthSalesMomentum,
  CustomerHealthActivitySignal,
} from "./customer-health-intelligence.types";

const ABANDON_RISK_DAYS = 21;
const DORMANT_CHURN_DAYS = 60;
const HIGH_OVERDUE_RATIO_THRESHOLD = 0.5;
const SCORE_MAX = 100;
const SCORE_MIN = 0;

type ActiveQuoteEntry = {
  abandonRiskCount: number;
  isEngaged: boolean;
  followUpCount: number;
};

export async function buildCustomerHealthIntelligence(
  organizationId: string,
  portfolio?: CustomerPortfolioIntelligence | null,
): Promise<CustomerHealthIntelligence> {
  const now = new Date();

  const [resolvedPortfolio, activeQuoteMap] = await Promise.all([
    portfolio ?? buildCustomerPortfolioIntelligence(organizationId),
    fetchActiveQuoteMap(organizationId, now),
  ]);

  const maxWonQuoteValue = resolvedPortfolio.customerSegments.reduce(
    (max, cp) => Math.max(max, cp.wonQuoteValue),
    0,
  );

  const profiles = resolvedPortfolio.customerSegments.map((cp) => {
    const quoteSignals = activeQuoteMap.get(cp.key) ?? emptyQuoteEntry();
    return buildHealthProfile(cp, quoteSignals, resolvedPortfolio, maxWonQuoteValue);
  });

  const distribution = computeDistribution(profiles);
  const criticalCustomers = profiles.filter((p) => p.healthLabel === "CRITICAL");
  const atRiskCustomers = profiles.filter((p) => p.healthLabel === "AT_RISK");
  const watchCustomers = profiles.filter((p) => p.healthLabel === "WATCH");

  const topInsights = buildTopInsights({
    criticalCustomers,
    atRiskCustomers,
    watchCustomers,
    totalCount: profiles.length,
  });

  const confidence = resolveOverallConfidence(resolvedPortfolio.confidence, profiles.length);

  return {
    profiles,
    distribution,
    criticalCustomers,
    atRiskCustomers,
    watchCustomers,
    topInsights,
    confidence,
    generatedAt: now.toISOString(),
    version: "v1.2",
  };
}

async function fetchActiveQuoteMap(
  organizationId: string,
  now: Date,
): Promise<Map<string, ActiveQuoteEntry>> {
  const quotes = await prisma.quote.findMany({
    where: { organizationId, status: { in: ["DRAFT", "SENT", "VIEWED", "NEGOTIATION"] } },
    select: {
      personId: true,
      customerName: true,
      status: true,
      sentAt: true,
      viewedAt: true,
      events: { select: { eventType: true } },
    },
  });

  const map = new Map<string, ActiveQuoteEntry>();
  const nowMs = now.getTime();

  for (const q of quotes) {
    const key = q.personId ?? `name:${q.customerName.trim().toLowerCase()}`;
    let entry = map.get(key);
    if (!entry) {
      entry = emptyQuoteEntry();
      map.set(key, entry);
    }

    const followUps = q.events.filter((e) => e.eventType === "QUOTE_FOLLOWED_UP").length;
    entry.followUpCount += followUps;

    if (q.status === "NEGOTIATION" || q.status === "VIEWED") {
      entry.isEngaged = true;
    }

    if (
      q.status === "SENT" &&
      q.sentAt !== null &&
      Math.floor((nowMs - q.sentAt.getTime()) / 86400000) >= ABANDON_RISK_DAYS &&
      q.viewedAt === null &&
      q.events.length === 0
    ) {
      entry.abandonRiskCount++;
    }
  }

  return map;
}

function emptyQuoteEntry(): ActiveQuoteEntry {
  return { abandonRiskCount: 0, isEngaged: false, followUpCount: 0 };
}

function buildHealthProfile(
  cp: CustomerProfile,
  quoteSignals: ActiveQuoteEntry,
  portfolio: CustomerPortfolioIntelligence,
  maxWonQuoteValue: number,
): CustomerHealthProfile {
  const overdueRatio = cp.totalPaymentDue > 0 ? cp.totalOverdue / cp.totalPaymentDue : 0;

  const paymentHealth: CustomerHealthPaymentHealth = {
    overdueCount: cp.overdueCount,
    totalOverdue: cp.totalOverdue,
    overdueRatio,
  };

  const salesMomentum: CustomerHealthSalesMomentum = {
    activeQuoteValue: cp.activeQuoteValue,
    abandonRiskCount: quoteSignals.abandonRiskCount,
    hasActiveQuoteRisk: quoteSignals.abandonRiskCount > 0 || cp.segment === "AT_RISK",
  };

  const isEngaged =
    quoteSignals.isEngaged ||
    (cp.activeQuoteValue > 0 && cp.daysSinceLastActivity < 30);

  const activitySignal: CustomerHealthActivitySignal = {
    daysSinceLastActivity: cp.daysSinceLastActivity,
    isEngaged,
    followUpCount: quoteSignals.followUpCount,
  };

  const healthScore = computeHealthScore({
    overdueCount: cp.overdueCount,
    overdueRatio,
    daysSinceLastActivity: cp.daysSinceLastActivity,
    abandonRiskCount: quoteSignals.abandonRiskCount,
    wonQuoteCount: cp.wonQuoteCount,
    isEngaged,
    activeQuoteValue: cp.activeQuoteValue,
  });

  const healthLabel = scoreToLabel(healthScore);

  const churnRisk =
    cp.daysSinceLastActivity > DORMANT_CHURN_DAYS ||
    quoteSignals.abandonRiskCount > 0 ||
    overdueRatio >= HIGH_OVERDUE_RATIO_THRESHOLD;

  const isActiveCustomer =
    cp.customerStatus === null || cp.customerStatus === "ACTIVE";

  const upsellOpportunity =
    isActiveCustomer &&
    cp.wonQuoteCount >= 1 &&
    (healthLabel === "HEALTHY" || healthLabel === "WATCH") &&
    cp.activeQuoteValue === 0;

  const repurchaseCandidate =
    cp.wonQuoteCount >= 1 &&
    cp.daysSinceLastActivity >= DORMANT_CHURN_DAYS &&
    cp.activeQuoteValue === 0;

  const opportunityScore = computeOpportunityScore({
    wonQuoteValue: cp.wonQuoteValue,
    maxWonQuoteValue,
    healthScore,
    activeQuoteValue: cp.activeQuoteValue,
  });

  const { recommendedAction, recommendedActionReason } = computeRecommendedAction({
    overdueCount: cp.overdueCount,
    repurchaseCandidate,
    upsellOpportunity,
    healthLabel,
  });

  const confidence = resolveProfileConfidence(cp, portfolio);

  const executiveInsights = buildProfileInsights({
    customerName: cp.displayName,
    healthLabel,
    paymentHealth,
    salesMomentum,
    activitySignal,
    churnRisk,
    wonQuoteCount: cp.wonQuoteCount,
    customerStatus: cp.customerStatus,
    customerTier: cp.customerTier,
    balanceCents: cp.balanceCents,
  });

  return {
    personId: cp.personId,
    customerId: cp.customerId,
    customerName: cp.displayName,
    healthScore,
    healthLabel,
    paymentHealth,
    salesMomentum,
    activitySignal,
    churnRisk,
    upsellOpportunity,
    repurchaseCandidate,
    opportunityScore,
    recommendedAction,
    recommendedActionReason,
    executiveInsights,
    confidence,
    customerStatus: cp.customerStatus,
    customerTier: cp.customerTier,
    storedHealthScore: cp.storedHealthScore,
    balanceCents: cp.balanceCents,
  };
}

function computeHealthScore(input: {
  overdueCount: number;
  overdueRatio: number;
  daysSinceLastActivity: number;
  abandonRiskCount: number;
  wonQuoteCount: number;
  isEngaged: boolean;
  activeQuoteValue: number;
}): number {
  let score = 100;

  if (input.overdueCount > 0) score -= 30;
  if (input.overdueRatio > HIGH_OVERDUE_RATIO_THRESHOLD) score -= 20;
  if (input.daysSinceLastActivity > 90) {
    score -= 25;
  } else if (input.daysSinceLastActivity > 60) {
    score -= 15;
  }
  if (input.abandonRiskCount > 0) score -= 20;
  if (input.wonQuoteCount >= 2) score += 15;
  if (input.isEngaged) score += 10;
  if (input.activeQuoteValue > 0) score += 5;

  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));
}

function computeOpportunityScore(input: {
  wonQuoteValue: number;
  maxWonQuoteValue: number;
  healthScore: number;
  activeQuoteValue: number;
}): number {
  const revenueComponent =
    input.maxWonQuoteValue > 0
      ? (input.wonQuoteValue / input.maxWonQuoteValue) * 50
      : 0;
  const healthComponent = (input.healthScore / 100) * 30;
  const pipelineBonus = input.activeQuoteValue > 0 ? 20 : 0;

  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(revenueComponent + healthComponent + pipelineBonus)));
}

function computeRecommendedAction(input: {
  overdueCount: number;
  repurchaseCandidate: boolean;
  upsellOpportunity: boolean;
  healthLabel: CustomerHealthLabel;
}): { recommendedAction: CustomerHealthRecommendedAction; recommendedActionReason: string } {
  if (input.overdueCount > 0) {
    return {
      recommendedAction: "COLLECTION_MEETING",
      recommendedActionReason: "Vadesi geçmiş tahsilat riski var.",
    };
  }
  if (input.repurchaseCandidate) {
    return {
      recommendedAction: "REENGAGEMENT_CALL",
      recommendedActionReason: "Daha önce satın aldı, uzun süredir aktif temas yok.",
    };
  }
  if (input.upsellOpportunity) {
    return {
      recommendedAction: "SEND_QUOTE",
      recommendedActionReason: "Sağlıklı müşteri, geçmiş alım var, aktif teklif yok.",
    };
  }
  if (input.healthLabel === "WATCH") {
    return {
      recommendedAction: "CLOSE_WATCH",
      recommendedActionReason: "Müşteri izleme bandında; yakın takip gerekli.",
    };
  }
  return {
    recommendedAction: "WATCH_AND_WAIT",
    recommendedActionReason: "Acil aksiyon gerektiren sinyal yok.",
  };
}

function scoreToLabel(score: number): CustomerHealthLabel {
  if (score >= 80) return "HEALTHY";
  if (score >= 60) return "WATCH";
  if (score >= 35) return "AT_RISK";
  return "CRITICAL";
}

function computeDistribution(profiles: CustomerHealthProfile[]): CustomerHealthDistribution {
  let healthyCount = 0;
  let watchCount = 0;
  let atRiskCount = 0;
  let criticalCount = 0;

  for (const p of profiles) {
    if (p.healthLabel === "HEALTHY") healthyCount++;
    else if (p.healthLabel === "WATCH") watchCount++;
    else if (p.healthLabel === "AT_RISK") atRiskCount++;
    else criticalCount++;
  }

  return { healthyCount, watchCount, atRiskCount, criticalCount };
}

function buildProfileInsights(input: {
  customerName: string;
  healthLabel: CustomerHealthLabel;
  paymentHealth: CustomerHealthPaymentHealth;
  salesMomentum: CustomerHealthSalesMomentum;
  activitySignal: CustomerHealthActivitySignal;
  churnRisk: boolean;
  wonQuoteCount: number;
  customerStatus: string | null;
  customerTier: string | null;
  balanceCents: number | null;
}): string[] {
  const insights: string[] = [];

  if (input.paymentHealth.overdueCount > 0) {
    const tierPrefix = input.customerTier ? `[${input.customerTier}] ` : "";
    const balanceSuffix = input.balanceCents !== null && input.balanceCents > 0
      ? `, kayıtlı bakiye: ${formatTRY(input.balanceCents / 100)}`
      : "";
    const statusSuffix = (input.customerStatus === "PASSIVE" || input.customerStatus === "BLOCKED")
      ? " — pasif müşteri, tahsilat odaklı yönet"
      : "";
    insights.push(
      `${tierPrefix}${input.paymentHealth.overdueCount} gecikmiş ödeme — ${formatTRY(input.paymentHealth.totalOverdue)} tahsilat bekliyor${balanceSuffix}${statusSuffix}.`,
    );
  } else if (input.customerStatus === "PASSIVE" || input.customerStatus === "BLOCKED") {
    const statusLabel = input.customerStatus === "BLOCKED" ? "bloke" : "pasif";
    insights.push(`Müşteri ${statusLabel} — satış fırsatı değil, risk takibinde tut.`);
  }

  if (input.salesMomentum.abandonRiskCount > 0) {
    insights.push(
      `${input.salesMomentum.abandonRiskCount} teklif kaybolma riskinde — 21+ gündür sessiz.`,
    );
  }

  if (input.activitySignal.daysSinceLastActivity > 90) {
    insights.push(`${input.activitySignal.daysSinceLastActivity} gündür hareketsiz — dormant risk.`);
  } else if (input.activitySignal.daysSinceLastActivity > 60 && input.churnRisk) {
    insights.push(`${input.activitySignal.daysSinceLastActivity} gündür hareketsiz — churn riski var.`);
  }

  if (input.activitySignal.isEngaged && input.salesMomentum.activeQuoteValue > 0) {
    insights.push(
      `Aktif teklif sürecinde — ${formatTRY(input.salesMomentum.activeQuoteValue)} pipeline'da.`,
    );
  }

  if (input.wonQuoteCount >= 2 && input.paymentHealth.overdueCount === 0) {
    insights.push("Geçmişte birden fazla sipariş — güvenilir müşteri.");
  }

  return insights.slice(0, 3);
}

function buildTopInsights(input: {
  criticalCustomers: CustomerHealthProfile[];
  atRiskCustomers: CustomerHealthProfile[];
  watchCustomers: CustomerHealthProfile[];
  totalCount: number;
}): string[] {
  const insights: string[] = [];

  if (input.criticalCustomers.length > 0) {
    const names = input.criticalCustomers.slice(0, 2).map((p) => {
      const tier = p.customerTier ? ` [${p.customerTier}]` : "";
      return `${p.customerName}${tier}`;
    }).join(", ");
    insights.push(
      `${input.criticalCustomers.length} müşteri kritik sağlık durumunda: ${names}.`,
    );
  }

  if (input.atRiskCustomers.length > 0) {
    const top = input.atRiskCustomers[0];
    insights.push(
      `${input.atRiskCustomers.length} müşteri risk bölgesinde — öne çıkan: ${top.customerName}.`,
    );
  }

  const churnRiskCount = [...input.criticalCustomers, ...input.atRiskCustomers, ...input.watchCustomers]
    .filter((p) => p.churnRisk).length;
  if (churnRiskCount > 0) {
    insights.push(`${churnRiskCount} müşteride churn riski sinyali var.`);
  }

  if (input.criticalCustomers.length === 0 && input.atRiskCustomers.length === 0) {
    insights.push(`${input.totalCount} müşterinin büyük bölümü sağlıklı görünüyor.`);
  }

  return insights.slice(0, 3);
}

function resolveOverallConfidence(
  portfolioConfidence: string,
  profileCount: number,
): CustomerHealthConfidence {
  if (profileCount === 0) return "LOW";
  if (portfolioConfidence === "HIGH") return "HIGH";
  if (portfolioConfidence === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function resolveProfileConfidence(
  cp: CustomerProfile,
  portfolio: CustomerPortfolioIntelligence,
): CustomerHealthConfidence {
  if (cp.personId && portfolio.quotePersonCoverage >= 0.8) return "HIGH";
  if (cp.personId) return "MEDIUM";
  return "LOW";
}

function formatTRY(amount: number): string {
  return `₺${amount.toLocaleString("tr-TR")}`;
}
