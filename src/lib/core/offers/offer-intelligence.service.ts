import { prisma } from "@/lib/core/shared/prisma";

type HeatLabel = "Sıcak" | "Ilık" | "Soğuk";

const unavailableDimensions = [
  { dimension: "Kârlılık", reason: "Teklif kalemlerinde maliyet/COGS verisi yok." },
  { dimension: "Fiyat Rekabetçiliği", reason: "Pazar veya rakip fiyat verisi yok." },
  { dimension: "Teslimat Yapılabilirliği", reason: "Kanonik üretim kapasitesi verisi yok." },
] as const;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function buildCustomerDecisionScorecard(input: {
  decidedQuotes: Array<{ status: "WON" | "LOST"; sentAt: Date | null; wonAt: Date | null; lostAt: Date | null; negotiationRounds: number }>;
  contestedTerms: Array<{ proposedAmount: boolean; proposedPaymentTerm: boolean; proposedDeliveryTerm: boolean }>;
}) {
  const sampleSize = input.decidedQuotes.length;
  if (sampleSize < 2) return { sufficientData: false as const, sampleSize, message: "Yetersiz veri — henüz yeterli teklif geçmişi yok" };
  const wonCount = input.decidedQuotes.filter((quote) => quote.status === "WON").length;
  const decisionDays = input.decidedQuotes.flatMap((quote) => {
    const decidedAt = quote.status === "WON" ? quote.wonAt : quote.lostAt;
    return quote.sentAt && decidedAt ? [Math.max(0, (decidedAt.getTime() - quote.sentAt.getTime()) / 86_400_000)] : [];
  });
  const termCounts = input.contestedTerms.reduce((counts, proposal) => ({
    amount: counts.amount + Number(proposal.proposedAmount),
    payment: counts.payment + Number(proposal.proposedPaymentTerm),
    delivery: counts.delivery + Number(proposal.proposedDeliveryTerm),
  }), { amount: 0, payment: 0, delivery: 0 });
  const maximum = Math.max(termCounts.amount, termCounts.payment, termCounts.delivery);
  const dominantContestedTerm = maximum === 0 ? "Pazarlık geçmişi yok" : termCounts.amount === maximum ? "Fiyat Odaklı" : termCounts.payment === maximum ? "Ödeme Koşulu Odaklı" : "Teslim Süresi Odaklı";
  return {
    sufficientData: true as const,
    sampleSize,
    winRate: Math.round((wonCount / sampleSize) * 100),
    avgDecisionDays: decisionDays.length ? Number((decisionDays.reduce((sum, days) => sum + days, 0) / decisionDays.length).toFixed(1)) : null,
    avgNegotiationRounds: Number((input.decidedQuotes.reduce((sum, quote) => sum + quote.negotiationRounds, 0) / sampleSize).toFixed(1)),
    dominantContestedTerm,
    unavailableBehaviors: [
      "Yönetim onayı davranışı hesaplanamıyor: sistemde müşteri yönetim onayı iş akışı sinyali yok.",
      "Sezonluk veya bütçe dönemi davranışı hesaplanamıyor: güvenilir çok yıllı dağılım verisi gelecekte biriktikçe değerlendirilecek.",
    ],
  };
}

export async function computeCustomerDecisionScorecard(customerId: string, organizationId: string, excludeQuoteId?: string) {
  const quotes = await prisma.quote.findMany({
    where: { organizationId, customerId, ...(excludeQuoteId ? { id: { not: excludeQuoteId } } : {}) },
    select: { id: true, status: true, sentAt: true, wonAt: true, lostAt: true, _count: { select: { counterProposals: true } }, counterProposals: { select: { proposedAmount: true, proposedPaymentTerm: true, proposedDeliveryTerm: true } } },
  });
  const decidedQuotes = quotes.filter((quote): quote is typeof quote & { status: "WON" | "LOST" } => quote.status === "WON" || quote.status === "LOST");
  return buildCustomerDecisionScorecard({
    decidedQuotes: decidedQuotes.map((quote) => ({ status: quote.status, sentAt: quote.sentAt, wonAt: quote.wonAt, lostAt: quote.lostAt, negotiationRounds: quote._count.counterProposals })),
    contestedTerms: quotes.flatMap((quote) => quote.counterProposals.map((proposal) => ({ proposedAmount: proposal.proposedAmount !== null, proposedPaymentTerm: proposal.proposedPaymentTerm !== null, proposedDeliveryTerm: proposal.proposedDeliveryTerm !== null }))),
  });
}

export async function computeOfferIntelligence(quoteId: string, organizationId: string) {
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, organizationId }, select: { id: true, customerId: true } });
  if (!quote) return null;
  const [viewCount, lastView, negotiationRounds] = await Promise.all([
    prisma.quoteEvent.count({ where: { organizationId, quoteId, eventType: "QUOTE_VIEWED" } }),
    prisma.quoteEvent.findFirst({ where: { organizationId, quoteId, eventType: "QUOTE_VIEWED" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.quoteCounterProposal.count({ where: { organizationId, quoteId } }),
  ]);

  let winProbability: { percent: number; sampleSize: number } | null = null;
  let financialRisk: { overdueCount: number; overdueAmount: string; score: number } | null = null;
  let strategicImportance: { customerWonTotal: string; organizationMedianWonTotal: string; relativePosition: "Medyan Üstü" | "Medyan Altı" | "Medyanla Eşit" } | null = null;
  if (quote.customerId) {
    const [history, overdue, wonByCustomer] = await Promise.all([
      prisma.quote.findMany({ where: { organizationId, customerId: quote.customerId, id: { not: quoteId }, status: { in: ["WON", "LOST"] } }, select: { status: true } }),
      prisma.payment.aggregate({ where: { organizationId, customerId: quote.customerId, status: "OVERDUE" }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.quote.groupBy({ by: ["customerId"], where: { organizationId, customerId: { not: null }, status: "WON" }, _sum: { amount: true } }),
    ]);
    if (history.length >= 2) winProbability = { percent: Math.round((history.filter((item) => item.status === "WON").length / history.length) * 100), sampleSize: history.length };
    const overdueCount = overdue._count._all;
    financialRisk = { overdueCount, overdueAmount: overdue._sum.amount?.toString() ?? "0", score: Math.max(0, 100 - overdueCount * 25) };
    const totals = wonByCustomer.map((group) => Number(group._sum.amount ?? 0));
    const organizationMedian = median(totals);
    const customerTotal = Number(wonByCustomer.find((group) => group.customerId === quote.customerId)?._sum.amount ?? 0);
    if (organizationMedian !== null) strategicImportance = { customerWonTotal: customerTotal.toFixed(2), organizationMedianWonTotal: organizationMedian.toFixed(2), relativePosition: customerTotal > organizationMedian ? "Medyan Üstü" : customerTotal < organizationMedian ? "Medyan Altı" : "Medyanla Eşit" };
  }

  const components = [
    { dimension: "Müşteri İlgisi", score: Math.min(100, viewCount * 25), evidence: `${viewCount} görüntülenme` },
    { dimension: "Pazarlık Kolaylığı", score: Math.max(0, 100 - negotiationRounds * 20), evidence: `${negotiationRounds} pazarlık turu` },
    ...(winProbability ? [{ dimension: "Kazanma Olasılığı", score: winProbability.percent, evidence: `${winProbability.sampleSize} geçmiş kararlı teklif` }] : []),
    ...(financialRisk ? [{ dimension: "Finansal Risk", score: financialRisk.score, evidence: `${financialRisk.overdueCount} gecikmiş ödeme` }] : []),
  ];
  const score = components.length ? Math.round(components.reduce((sum, component) => sum + component.score, 0) / components.length) : null;
  const heat: HeatLabel | null = score === null ? null : score >= 67 ? "Sıcak" : score >= 34 ? "Ilık" : "Soğuk";
  return {
    quoteId,
    customerInterest: { viewCount, lastViewedAt: lastView?.createdAt.toISOString() ?? null },
    negotiationDifficulty: { rounds: negotiationRounds },
    winProbability,
    financialRisk,
    strategicImportance,
    executiveScore: { score, heat, components, method: "Mevcut her bileşen 0–100 aralığında eşit ağırlıkla ortalanır; eksik bileşen ortalamaya katılmaz." },
    unavailableDimensions,
  };
}
