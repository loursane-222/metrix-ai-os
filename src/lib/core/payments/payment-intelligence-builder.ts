import type {
  PaymentContext,
  PaymentContextOverdueItem,
  PaymentContextPartialItem,
} from "./payment-context-builder";

export type CashRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CollectionPressure = "LOW" | "MEDIUM" | "HIGH";

export type PaymentPriorityItem = {
  customerName: string;
  title: string;
  remaining: number;
  status: "OVERDUE" | "PARTIAL";
  daysPastDue: number;
  dueDate: string | null;
  urgencyScore: number;
};

export type PaymentIntelligence = {
  cashRiskLevel: CashRiskLevel;
  collectionPressure: CollectionPressure;
  overdueRatio: number;
  topPriorityItem: PaymentPriorityItem | null;
  prioritizedItems: PaymentPriorityItem[];
  overdueInsights: string | null;
  partialPaymentInsights: string | null;
  nextBestActions: string[];
  executiveSummary: string;
  riskWarnings: string[];
  hasActiveRisk: boolean;
};

const CRITICAL_OVERDUE_RATIO = 0.5;
const HIGH_OVERDUE_RATIO = 0.25;
const CRITICAL_DAYS = 90;
const HIGH_DAYS = 45;
const LEGAL_THRESHOLD_DAYS = 60;
const URGENT_THRESHOLD_DAYS = 30;
const HIGH_PRESSURE_OVERDUE_COUNT = 2;
const HIGH_PRESSURE_DAYS = 30;
const HIGH_RISK_OVERDUE_COUNT = 3;

export function buildPaymentIntelligence(context: PaymentContext): PaymentIntelligence {
  const { overdueItems, partialItems, totalReceivable, totalOverdue, overdueCount, partialCount, pendingCount } = context;

  const overdueRatio = totalReceivable > 0 ? totalOverdue / totalReceivable : 0;
  const maxDaysPastDue = overdueItems.length > 0 ? Math.max(...overdueItems.map((i) => i.daysPastDue)) : 0;

  const cashRiskLevel = computeCashRiskLevel({ overdueRatio, maxDaysPastDue, overdueCount, totalOverdue });
  const collectionPressure = computeCollectionPressure({ overdueCount, maxDaysPastDue, partialCount });

  const prioritizedItems = buildPrioritizedItems(overdueItems, partialItems);
  const topPriorityItem = prioritizedItems[0] ?? null;

  const overdueInsights = buildOverdueInsights(overdueItems, totalOverdue, overdueRatio);
  const partialPaymentInsights = buildPartialPaymentInsights(partialItems);
  const nextBestActions = buildNextBestActions({ overdueItems, partialItems, topPriorityItem });
  const riskWarnings = buildRiskWarnings({ cashRiskLevel, overdueRatio, maxDaysPastDue, totalOverdue });
  const executiveSummary = buildExecutiveSummary({
    cashRiskLevel,
    totalReceivable,
    totalOverdue,
    overdueCount,
    partialCount,
    pendingCount,
    overdueRatio,
    topPriorityItem,
  });

  const hasActiveRisk = cashRiskLevel === "HIGH" || cashRiskLevel === "CRITICAL" || overdueCount > 0;

  return {
    cashRiskLevel,
    collectionPressure,
    overdueRatio,
    topPriorityItem,
    prioritizedItems,
    overdueInsights,
    partialPaymentInsights,
    nextBestActions,
    executiveSummary,
    riskWarnings,
    hasActiveRisk,
  };
}

function computeCashRiskLevel(input: {
  overdueRatio: number;
  maxDaysPastDue: number;
  overdueCount: number;
  totalOverdue: number;
}): CashRiskLevel {
  if (input.totalOverdue === 0) return "LOW";
  if (input.overdueRatio >= CRITICAL_OVERDUE_RATIO || input.maxDaysPastDue >= CRITICAL_DAYS) {
    return "CRITICAL";
  }
  if (
    input.overdueRatio >= HIGH_OVERDUE_RATIO ||
    input.maxDaysPastDue >= HIGH_DAYS ||
    input.overdueCount >= HIGH_RISK_OVERDUE_COUNT
  ) {
    return "HIGH";
  }
  return "MEDIUM";
}

function computeCollectionPressure(input: {
  overdueCount: number;
  maxDaysPastDue: number;
  partialCount: number;
}): CollectionPressure {
  if (input.overdueCount >= HIGH_PRESSURE_OVERDUE_COUNT || input.maxDaysPastDue >= HIGH_PRESSURE_DAYS) return "HIGH";
  if (input.overdueCount >= 1 || input.partialCount >= 1) return "MEDIUM";
  return "LOW";
}

function buildPrioritizedItems(
  overdueItems: PaymentContextOverdueItem[],
  partialItems: PaymentContextPartialItem[],
): PaymentPriorityItem[] {
  const overdueConverted: PaymentPriorityItem[] = overdueItems.map((item) => {
    const remaining = item.amount - item.paidAmount;
    return {
      customerName: item.customerName,
      title: item.title,
      remaining,
      status: "OVERDUE",
      daysPastDue: item.daysPastDue,
      dueDate: item.dueDate,
      urgencyScore: computeUrgencyScore(remaining, item.daysPastDue, "OVERDUE"),
    };
  });

  const partialConverted: PaymentPriorityItem[] = partialItems.map((item) => {
    const remaining = item.amount - item.paidAmount;
    return {
      customerName: item.customerName,
      title: item.title,
      remaining,
      status: "PARTIAL",
      daysPastDue: 0,
      dueDate: item.dueDate,
      urgencyScore: computeUrgencyScore(remaining, 0, "PARTIAL"),
    };
  });

  return [...overdueConverted, ...partialConverted].sort((a, b) => b.urgencyScore - a.urgencyScore);
}

function computeUrgencyScore(remaining: number, daysPastDue: number, status: "OVERDUE" | "PARTIAL"): number {
  const statusMultiplier = status === "OVERDUE" ? 2.0 : 1.0;
  const daysPenalty = daysPastDue * 1000;
  return (remaining + daysPenalty) * statusMultiplier;
}

function buildOverdueInsights(
  overdueItems: PaymentContextOverdueItem[],
  totalOverdue: number,
  overdueRatio: number,
): string | null {
  if (overdueItems.length === 0) return null;

  const parts: string[] = [];
  const ratioPercent = Math.round(overdueRatio * 100);
  parts.push(`Toplam alacağın %${ratioPercent}'i vadesi geçmiş (${formatTRY(totalOverdue)}).`);

  const criticalItems = overdueItems.filter((i) => i.daysPastDue >= LEGAL_THRESHOLD_DAYS);
  if (criticalItems.length > 0) {
    const names = criticalItems.map((i) => `${i.customerName} (${i.daysPastDue} gün)`).join(", ");
    parts.push(`60+ gün geciken: ${names}.`);
  }

  const sorted = [...overdueItems].sort((a, b) => b.amount - b.paidAmount - (a.amount - a.paidAmount));
  const top = sorted[0];
  if (top) {
    const remaining = top.amount - top.paidAmount;
    parts.push(`En yüksek tutar: ${top.customerName} — ${formatTRY(remaining)}, ${top.daysPastDue} gün gecikti.`);
  }

  return parts.join(" ");
}

function buildPartialPaymentInsights(partialItems: PaymentContextPartialItem[]): string | null {
  if (partialItems.length === 0) return null;

  return partialItems
    .map((item) => {
      const remaining = item.amount - item.paidAmount;
      const paidRatio = item.amount > 0 ? Math.round((item.paidAmount / item.amount) * 100) : 0;
      return `${item.customerName} / ${item.title}: %${paidRatio} ödendi, kalan ${formatTRY(remaining)}${item.dueDate ? `, vade: ${item.dueDate}` : ""}.`;
    })
    .join(" ");
}

function buildNextBestActions(input: {
  overdueItems: PaymentContextOverdueItem[];
  partialItems: PaymentContextPartialItem[];
  topPriorityItem: PaymentPriorityItem | null;
}): string[] {
  const actions: string[] = [];

  const legalRisk = input.overdueItems.filter((i) => i.daysPastDue >= LEGAL_THRESHOLD_DAYS);
  for (const item of legalRisk.slice(0, 2)) {
    actions.push(
      `${item.customerName} — ${formatTRY(item.amount - item.paidAmount)} için hukuki uyarı veya avukat sürecini değerlendir (${item.daysPastDue} gün gecikme).`,
    );
  }

  const urgentOverdue = input.overdueItems.filter(
    (i) => i.daysPastDue >= URGENT_THRESHOLD_DAYS && i.daysPastDue < LEGAL_THRESHOLD_DAYS,
  );
  for (const item of urgentOverdue.slice(0, 2)) {
    actions.push(
      `${item.customerName} ile bu hafta doğrudan görüşme planla — ${formatTRY(item.amount - item.paidAmount)} tahsilatı bekliyor.`,
    );
  }

  const recentOverdue = input.overdueItems.filter((i) => i.daysPastDue < URGENT_THRESHOLD_DAYS);
  for (const item of recentOverdue.slice(0, 1)) {
    actions.push(
      `${item.customerName} — ${item.title} için ödeme hatırlatması gönder (${item.daysPastDue} gün gecikti).`,
    );
  }

  for (const item of input.partialItems.slice(0, 2)) {
    const remaining = item.amount - item.paidAmount;
    actions.push(
      `${item.customerName} / ${item.title}: kalan ${formatTRY(remaining)} için net ödeme tarihi al.`,
    );
  }

  if (actions.length === 0 && input.topPriorityItem) {
    actions.push(
      `${input.topPriorityItem.customerName} — ${formatTRY(input.topPriorityItem.remaining)} tahsilatını önceliklendir.`,
    );
  }

  return actions.slice(0, 4);
}

function buildRiskWarnings(input: {
  cashRiskLevel: CashRiskLevel;
  overdueRatio: number;
  maxDaysPastDue: number;
  totalOverdue: number;
}): string[] {
  const warnings: string[] = [];

  if (input.cashRiskLevel === "CRITICAL") {
    warnings.push(
      `Nakit riski KRİTİK: alacağın %${Math.round(input.overdueRatio * 100)}'i vadesi geçmiş (${formatTRY(input.totalOverdue)}).`,
    );
  } else if (input.cashRiskLevel === "HIGH") {
    warnings.push(`Nakit riski YÜKSEK: ${formatTRY(input.totalOverdue)} tahsilat acil bekliyor.`);
  }

  if (input.maxDaysPastDue >= CRITICAL_DAYS) {
    warnings.push("90+ gün geciken tahsilat var — hukuki süreç acil.");
  } else if (input.maxDaysPastDue >= LEGAL_THRESHOLD_DAYS) {
    warnings.push("60+ gün geciken tahsilat var — acil aksiyon gerekiyor.");
  }

  return warnings;
}

function buildExecutiveSummary(input: {
  cashRiskLevel: CashRiskLevel;
  totalReceivable: number;
  totalOverdue: number;
  overdueCount: number;
  partialCount: number;
  pendingCount: number;
  overdueRatio: number;
  topPriorityItem: PaymentPriorityItem | null;
}): string {
  const { cashRiskLevel, totalReceivable, totalOverdue, overdueCount, partialCount, pendingCount, overdueRatio, topPriorityItem } = input;

  const riskLabel: Record<CashRiskLevel, string> = {
    LOW: "düşük",
    MEDIUM: "orta",
    HIGH: "yüksek",
    CRITICAL: "kritik",
  };

  if (totalReceivable === 0) {
    return "Açık tahsilat kaydı bulunmuyor.";
  }

  const parts: string[] = [];

  if (overdueCount === 0 && partialCount === 0) {
    parts.push(
      `Toplam ${formatTRY(totalReceivable)} alacak var, tamamı henüz vadesi girmemiş — risk ${riskLabel[cashRiskLevel]}.`,
    );
  } else if (overdueCount > 0) {
    const ratioPercent = Math.round(overdueRatio * 100);
    parts.push(
      `Tahsilat riski ${riskLabel[cashRiskLevel].toUpperCase()}: ${formatTRY(totalOverdue)}, toplam alacağın %${ratioPercent}'i vadesi geçmiş.`,
    );
    if (topPriorityItem) {
      const dayNote = topPriorityItem.daysPastDue > 0 ? `, ${topPriorityItem.daysPastDue} gün gecikti` : "";
      parts.push(`Öncelik: ${topPriorityItem.customerName} — ${formatTRY(topPriorityItem.remaining)}${dayNote}.`);
    }
  }

  if (partialCount > 0) {
    parts.push(`${partialCount} kısmi ödeme var — takip gerekiyor.`);
  }

  if (pendingCount > 0) {
    parts.push(`${pendingCount} kayıt henüz vadeye girmemiş.`);
  }

  return parts.join(" ");
}

function formatTRY(amount: number): string {
  return `₺${amount.toLocaleString("tr-TR")}`;
}
