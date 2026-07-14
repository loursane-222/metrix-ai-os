import { prisma } from "@/lib/core/shared/prisma";
import type {
  CustomerProfile,
  CustomerPortfolioIntelligence,
  CustomerSegment,
  ConcentrationRisk,
  ConcentrationRiskLevel,
  DependencyRisk,
  CustomerRiskItem,
  StrategicCustomer,
  PortfolioConfidence,
} from "./customer-portfolio-intelligence.types";

const DORMANT_DAYS = 90;
const NEW_DAYS = 30;
const CHURN_RISK_INACTIVE_DAYS = 60;
const HIGH_VALUE_THRESHOLD = 50000;
const CONCENTRATION_MEDIUM = 0.25;
const CONCENTRATION_HIGH = 0.40;
const CONCENTRATION_CRITICAL = 0.60;
const TOP3_MEDIUM = 0.60;
const TOP3_HIGH = 0.75;
const TOP3_CRITICAL = 0.90;
const MAX_STRATEGIC = 5;
const MAX_AT_RISK = 10;
const MAX_CHURN_RISK = 5;

const ACTIVE_QUOTE_STATUSES = new Set(["DRAFT", "SENT", "VIEWED", "NEGOTIATION"]);

type InternalProfile = {
  key: string;
  personId: string | null;
  customerId: string | null;
  displayName: string;
  totalQuoteValue: number;
  wonQuoteValue: number;
  activeQuoteValue: number;
  quoteCount: number;
  wonQuoteCount: number;
  lostQuoteCount: number;
  totalPaid: number;
  totalPaymentDue: number;
  totalOverdue: number;
  overdueCount: number;
  lastActivityAt: Date | null;
  customerStatus: string | null;
  customerTier: string | null;
  storedHealthScore: number | null;
  balanceCents: number | null;
};

export async function buildCustomerPortfolioIntelligence(
  organizationId: string,
): Promise<CustomerPortfolioIntelligence> {
  const now = new Date();

  const [quotes, payments, customerRecords, personCustomerLinks] = await Promise.all([
    prisma.quote.findMany({
      where: { organizationId },
      select: {
        personId: true,
        customerName: true,
        amount: true,
        status: true,
        updatedAt: true,
        wonAt: true,
        lostAt: true,
      },
    }),
    prisma.payment.findMany({
      where: { organizationId },
      select: {
        personId: true,
        amount: true,
        paidAmount: true,
        status: true,
        paidAt: true,
        updatedAt: true,
        person: { select: { fullName: true } },
      },
    }),
    prisma.customer.findMany({
      where: { organizationId },
      select: {
        id: true,
        displayName: true,
        status: true,
        tier: true,
        healthScore: true,
        balanceCents: true,
      },
    }),
    // Customer Foundation (Faz 1): CustomerContact üzerinden personId -> customerId
    // eşlemesi. Bu, personId bazlı skorlama mantığını değiştirmeden Customer
    // Intelligence çıktısına kanonik customerId ekler.
    prisma.customerContact.findMany({
      where: { organizationId, personId: { not: null } },
      select: { personId: true, customerId: true },
    }),
  ]);

  const customerMetaById = new Map<string, {
    status: string;
    tier: string | null;
    healthScore: number | null;
    balanceCents: number;
  }>();
  const customerByName = new Map<string, {
    status: string;
    tier: string | null;
    healthScore: number | null;
    balanceCents: number;
  }>();
  for (const c of customerRecords) {
    const meta = {
      status: c.status,
      tier: c.tier,
      healthScore: c.healthScore,
      balanceCents: Number(c.balanceCents),
    };
    customerMetaById.set(c.id, meta);

    const nameKey = c.displayName.trim().toLowerCase();
    if (!customerByName.has(nameKey)) {
      customerByName.set(nameKey, meta);
    }
  }

  const personIdToCustomerId = new Map<string, string>();
  for (const link of personCustomerLinks) {
    if (link.personId) personIdToCustomerId.set(link.personId, link.customerId);
  }

  const profiles = new Map<string, InternalProfile>();
  let quotesWithPersonId = 0;
  let paymentsWithPersonId = 0;

  for (const q of quotes) {
    if (q.personId) quotesWithPersonId++;
    const key = q.personId ?? `name:${q.customerName.trim().toLowerCase()}`;

    let p = profiles.get(key);
    if (!p) {
      p = emptyProfile(key, q.personId, q.customerName, personIdToCustomerId);
      profiles.set(key, p);
    }

    const amount = toSafeNumber(q.amount);
    p.quoteCount++;
    p.totalQuoteValue += amount;

    if (q.status === "WON") {
      p.wonQuoteValue += amount;
      p.wonQuoteCount++;
    } else if (q.status === "LOST" || q.status === "CANCELLED") {
      p.lostQuoteCount++;
    } else if (ACTIVE_QUOTE_STATUSES.has(q.status)) {
      p.activeQuoteValue += amount;
    }

    const activityAt = q.wonAt ?? q.lostAt ?? q.updatedAt;
    if (!p.lastActivityAt || activityAt > p.lastActivityAt) p.lastActivityAt = activityAt;
  }

  for (const pay of payments) {
    if (!pay.personId) continue;
    paymentsWithPersonId++;

    const key = pay.personId;
    let p = profiles.get(key);
    if (!p) {
      p = emptyProfile(key, pay.personId, pay.person?.fullName ?? key, personIdToCustomerId);
      profiles.set(key, p);
    }

    const amount = toSafeNumber(pay.amount);
    const paidAmount = toSafeNumber(pay.paidAmount);

    if (pay.status === "PAID") {
      p.totalPaid += amount;
    } else if (pay.status !== "CANCELLED" && pay.status !== "WRITTEN_OFF") {
      p.totalPaymentDue += amount - paidAmount;
      if (pay.status === "OVERDUE") {
        p.totalOverdue += amount - paidAmount;
        p.overdueCount++;
      }
    }

    const activityAt = pay.paidAt ?? pay.updatedAt;
    if (!p.lastActivityAt || activityAt > p.lastActivityAt) p.lastActivityAt = activityAt;
  }

  for (const p of profiles.values()) {
    // Öncelik: CustomerContact üzerinden kurulan kanonik customerId eşlemesi.
    // Bu bağlantı yoksa (henüz taşınmamış eski kayıtlar) isim eşleşmesine düşer.
    const meta = (p.customerId && customerMetaById.get(p.customerId)) ||
      customerByName.get(p.displayName.trim().toLowerCase());
    if (meta) {
      p.customerStatus = meta.status;
      p.customerTier = meta.tier;
      p.storedHealthScore = meta.healthScore;
      p.balanceCents = meta.balanceCents;
    }
  }

  const nowMs = now.getTime();
  const customerProfiles: CustomerProfile[] = Array.from(profiles.values()).map((p) => {
    const daysSince = p.lastActivityAt
      ? Math.floor((nowMs - p.lastActivityAt.getTime()) / 86400000)
      : 999;
    return {
      key: p.key,
      personId: p.personId,
      customerId: p.customerId,
      displayName: p.displayName,
      segment: classifySegment(p, daysSince),
      totalQuoteValue: p.totalQuoteValue,
      wonQuoteValue: p.wonQuoteValue,
      activeQuoteValue: p.activeQuoteValue,
      quoteCount: p.quoteCount,
      wonQuoteCount: p.wonQuoteCount,
      lostQuoteCount: p.lostQuoteCount,
      totalPaymentDue: p.totalPaymentDue,
      totalPaid: p.totalPaid,
      totalOverdue: p.totalOverdue,
      overdueCount: p.overdueCount,
      lastActivityDate: p.lastActivityAt ? p.lastActivityAt.toISOString().slice(0, 10) : null,
      daysSinceLastActivity: daysSince,
      customerStatus: p.customerStatus,
      customerTier: p.customerTier,
      storedHealthScore: p.storedHealthScore,
      balanceCents: p.balanceCents,
    };
  });

  const totalPortfolioValue = customerProfiles.reduce(
    (s, c) => s + c.wonQuoteValue + c.totalPaid + c.activeQuoteValue,
    0,
  );

  const concentrationRisk = buildConcentrationRisk(customerProfiles, totalPortfolioValue);
  const dependencyRisk = buildDependencyRisk(customerProfiles, totalPortfolioValue);

  const atRiskCustomers: CustomerRiskItem[] = customerProfiles
    .filter((c) => c.overdueCount > 0)
    .sort((a, b) => b.totalOverdue - a.totalOverdue)
    .slice(0, MAX_AT_RISK)
    .map(toRiskItem);

  const churnRiskCustomers: CustomerRiskItem[] = customerProfiles
    .filter(
      (c) =>
        c.quoteCount > 0 &&
        c.wonQuoteCount === 0 &&
        c.daysSinceLastActivity >= CHURN_RISK_INACTIVE_DAYS,
    )
    .sort((a, b) => b.daysSinceLastActivity - a.daysSinceLastActivity)
    .slice(0, MAX_CHURN_RISK)
    .map(toRiskItem);

  const strategicCustomers: StrategicCustomer[] = customerProfiles
    .filter((c) => c.wonQuoteValue + c.totalPaid >= HIGH_VALUE_THRESHOLD || c.wonQuoteCount >= 2)
    .sort((a, b) => b.wonQuoteValue + b.totalPaid - (a.wonQuoteValue + a.totalPaid))
    .slice(0, MAX_STRATEGIC)
    .map((c) => ({
      displayName: c.displayName,
      personId: c.personId,
      customerId: c.customerId,
      totalValue: c.wonQuoteValue + c.totalPaid,
      wonQuoteValue: c.wonQuoteValue,
      paymentHealthy: c.overdueCount === 0,
      customerTier: c.customerTier,
      storedHealthScore: c.storedHealthScore,
    }));

  const quotePersonCoverage = quotes.length > 0 ? quotesWithPersonId / quotes.length : 1;
  const paymentPersonCoverage = payments.length > 0 ? paymentsWithPersonId / payments.length : 1;
  const confidence = resolveConfidence(quotePersonCoverage, paymentPersonCoverage, customerProfiles.length);

  const dataGaps = buildDataGaps(
    quotes.length,
    quotesWithPersonId,
    payments.length,
    paymentsWithPersonId,
  );

  const executiveSignals = buildExecutiveSignals({
    atRiskCustomers,
    strategicCustomers,
    concentrationRisk,
    churnRiskCustomers,
    totalCustomerCount: customerProfiles.length,
  });

  const portfolioSummary = buildPortfolioSummary({
    totalCustomerCount: customerProfiles.length,
    atRiskCount: atRiskCustomers.length,
    strategicCount: strategicCustomers.length,
    concentrationRisk,
    confidence,
  });

  return {
    customerSegments: customerProfiles,
    concentrationRisk,
    dependencyRisk,
    churnRiskCustomers,
    strategicCustomers,
    atRiskCustomers,
    portfolioSummary,
    executiveSignals,
    confidence,
    dataGaps,
    quotePersonCoverage,
    paymentPersonCoverage,
    totalCustomerCount: customerProfiles.length,
  };
}

function emptyProfile(
  key: string,
  personId: string | null,
  displayName: string,
  personIdToCustomerId: Map<string, string>,
): InternalProfile {
  return {
    key,
    personId,
    customerId: personId ? personIdToCustomerId.get(personId) ?? null : null,
    displayName,
    totalQuoteValue: 0,
    wonQuoteValue: 0,
    activeQuoteValue: 0,
    quoteCount: 0,
    wonQuoteCount: 0,
    lostQuoteCount: 0,
    totalPaid: 0,
    totalPaymentDue: 0,
    totalOverdue: 0,
    overdueCount: 0,
    lastActivityAt: null,
    customerStatus: null,
    customerTier: null,
    storedHealthScore: null,
    balanceCents: null,
  };
}

function classifySegment(p: InternalProfile, daysSince: number): CustomerSegment {
  if (p.overdueCount > 0) return "AT_RISK";
  const realizedValue = p.wonQuoteValue + p.totalPaid;
  if (realizedValue >= HIGH_VALUE_THRESHOLD) return "HIGH_VALUE";
  if (daysSince < NEW_DAYS && p.quoteCount <= 2 && p.wonQuoteCount === 0) return "NEW";
  if (daysSince >= DORMANT_DAYS && p.quoteCount > 0) return "DORMANT";
  if (!p.personId && p.quoteCount === 0 && p.totalPaid === 0) return "UNKNOWN";
  return "GROWING";
}

function customerPortfolioValue(c: CustomerProfile): number {
  return c.wonQuoteValue + c.totalPaid + c.activeQuoteValue;
}

function buildConcentrationRisk(
  profiles: CustomerProfile[],
  totalPortfolioValue: number,
): ConcentrationRisk {
  if (profiles.length === 0 || totalPortfolioValue === 0) {
    return {
      level: "LOW",
      topCustomerName: null,
      topCustomerShare: 0,
      topCustomerValue: 0,
      totalPortfolioValue: 0,
      topCustomerStatus: null,
      topCustomerBalanceCents: null,
    };
  }

  const sorted = [...profiles].sort((a, b) => customerPortfolioValue(b) - customerPortfolioValue(a));
  const top = sorted[0];
  const topValue = customerPortfolioValue(top);
  const share = topValue / totalPortfolioValue;

  const level: ConcentrationRiskLevel =
    share >= CONCENTRATION_CRITICAL ? "CRITICAL" :
    share >= CONCENTRATION_HIGH ? "HIGH" :
    share >= CONCENTRATION_MEDIUM ? "MEDIUM" :
    "LOW";

  return {
    level,
    topCustomerName: top.displayName,
    topCustomerShare: share,
    topCustomerValue: topValue,
    totalPortfolioValue,
    topCustomerStatus: top.customerStatus,
    topCustomerBalanceCents: top.balanceCents,
  };
}

function buildDependencyRisk(
  profiles: CustomerProfile[],
  totalPortfolioValue: number,
): DependencyRisk {
  if (profiles.length === 0 || totalPortfolioValue === 0) {
    return { level: "LOW", dependentCustomerCount: profiles.length, top3ShareCombined: 0 };
  }

  const sorted = [...profiles]
    .sort((a, b) => customerPortfolioValue(b) - customerPortfolioValue(a))
    .slice(0, 3);

  const top3Sum = sorted.reduce((s, c) => s + customerPortfolioValue(c), 0);
  const share = top3Sum / totalPortfolioValue;

  const level: ConcentrationRiskLevel =
    share >= TOP3_CRITICAL ? "CRITICAL" :
    share >= TOP3_HIGH ? "HIGH" :
    share >= TOP3_MEDIUM ? "MEDIUM" :
    "LOW";

  return {
    level,
    dependentCustomerCount: profiles.length,
    top3ShareCombined: share,
  };
}

function toRiskItem(c: CustomerProfile): CustomerRiskItem {
  return {
    displayName: c.displayName,
    personId: c.personId,
    customerId: c.customerId,
    totalOverdue: c.totalOverdue,
    overdueCount: c.overdueCount,
    daysSinceLastActivity: c.daysSinceLastActivity,
    balanceCents: c.balanceCents,
    customerStatus: c.customerStatus,
  };
}

function resolveConfidence(
  quotePersonCoverage: number,
  paymentPersonCoverage: number,
  customerCount: number,
): PortfolioConfidence {
  if (customerCount === 0) return "LOW";
  const avgCoverage = (quotePersonCoverage + paymentPersonCoverage) / 2;
  if (avgCoverage >= 0.8) return "HIGH";
  if (avgCoverage >= 0.4) return "MEDIUM";
  return "LOW";
}

function buildDataGaps(
  totalQuotes: number,
  quotesWithPersonId: number,
  totalPayments: number,
  paymentsWithPersonId: number,
): string[] {
  const gaps: string[] = [];

  const unlinkedQuotes = totalQuotes - quotesWithPersonId;
  if (unlinkedQuotes > 0) {
    gaps.push(
      `${unlinkedQuotes} / ${totalQuotes} teklif müşteri kaydına bağlı değil — müşteri bazlı analiz kısmi.`,
    );
  }

  const unlinkedPayments = totalPayments - paymentsWithPersonId;
  if (unlinkedPayments > 0) {
    gaps.push(
      `${unlinkedPayments} / ${totalPayments} ödeme kişi kaydına bağlı değil — ödeme portföyü eksik hesaplanıyor.`,
    );
  }

  return gaps;
}

function buildExecutiveSignals(input: {
  atRiskCustomers: CustomerRiskItem[];
  strategicCustomers: StrategicCustomer[];
  concentrationRisk: ConcentrationRisk;
  churnRiskCustomers: CustomerRiskItem[];
  totalCustomerCount: number;
}): string[] {
  const signals: string[] = [];

  if (input.atRiskCustomers.length > 0) {
    const top = input.atRiskCustomers[0];
    const statusNote = (top.customerStatus === "PASSIVE" || top.customerStatus === "BLOCKED")
      ? " [pasif müşteri — tahsilat odaklı]"
      : "";
    const balanceNote = top.balanceCents !== null && top.balanceCents > 0
      ? `, kayıtlı bakiye: ${formatTRY(top.balanceCents / 100)}`
      : "";
    signals.push(
      `${input.atRiskCustomers.length} müşteride gecikmiş ödeme var — en kritik: ${top.displayName} (${formatTRY(top.totalOverdue)}${balanceNote})${statusNote}.`,
    );
  }

  if (input.concentrationRisk.level === "CRITICAL" || input.concentrationRisk.level === "HIGH") {
    const pct = Math.round(input.concentrationRisk.topCustomerShare * 100);
    const statusNote = (input.concentrationRisk.topCustomerStatus === "PASSIVE" ||
                        input.concentrationRisk.topCustomerStatus === "BLOCKED")
      ? " [pasif müşteri]"
      : "";
    signals.push(
      `Konsantrasyon riski ${input.concentrationRisk.level === "CRITICAL" ? "KRİTİK" : "YÜKSEK"}: ${input.concentrationRisk.topCustomerName}${statusNote} portföyün %${pct}'ini oluşturuyor.`,
    );
  }

  if (input.strategicCustomers.length > 0) {
    const unhealthy = input.strategicCustomers.filter((c) => !c.paymentHealthy);
    if (unhealthy.length > 0) {
      signals.push(
        `Stratejik müşteri uyarısı: ${unhealthy.map((c) => {
          const tier = c.customerTier ? ` [${c.customerTier}]` : "";
          return `${c.displayName}${tier}`;
        }).join(", ")} — yüksek değerli ama ödeme sorunu var.`,
      );
    }
  }

  if (input.churnRiskCustomers.length > 0) {
    signals.push(
      `${input.churnRiskCustomers.length} müşteri ${CHURN_RISK_INACTIVE_DAYS}+ gündür hareketsiz — churn riski var.`,
    );
  }

  return signals.slice(0, 4);
}

function buildPortfolioSummary(input: {
  totalCustomerCount: number;
  atRiskCount: number;
  strategicCount: number;
  concentrationRisk: ConcentrationRisk;
  confidence: PortfolioConfidence;
}): string {
  if (input.totalCustomerCount === 0) return "Müşteri portföyü verisi yok.";

  const parts: string[] = [];
  parts.push(`${input.totalCustomerCount} müşteri profili analiz edildi.`);

  if (input.atRiskCount > 0) {
    parts.push(`${input.atRiskCount} tanesi tahsilat riski taşıyor.`);
  }
  if (input.strategicCount > 0) {
    parts.push(`${input.strategicCount} stratejik müşteri tespit edildi.`);
  }
  if (input.concentrationRisk.level !== "LOW") {
    const pct = Math.round(input.concentrationRisk.topCustomerShare * 100);
    parts.push(
      `Konsantrasyon riski ${input.concentrationRisk.level === "CRITICAL" ? "kritik" : input.concentrationRisk.level === "HIGH" ? "yüksek" : "orta"} (en büyük müşteri: %${pct}).`,
    );
  }
  if (input.confidence === "LOW") {
    parts.push("Veri bağlantısı eksik — sonuçlar yaklaşık.");
  }

  return parts.join(" ");
}

function toSafeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatTRY(amount: number): string {
  return `₺${amount.toLocaleString("tr-TR")}`;
}
