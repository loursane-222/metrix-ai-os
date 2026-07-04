import type {
  BurnRiskLevel,
  ExpenseConfidence,
  ExpenseContext,
  ExpenseContextItem,
  ExpenseIntelligence,
} from "./expense-intelligence.types";

const CRITICAL_OVERDUE_RATIO = 0.3;
const HIGH_OVERDUE_RATIO = 0.15;

export function buildExpenseIntelligence(context: ExpenseContext): ExpenseIntelligence {
  if (!context.hasExpenseData) {
    return buildEmptyIntelligence();
  }

  const overdueRatio =
    context.totalExpenseAmount > 0
      ? context.totalOverdueAmount / context.totalExpenseAmount
      : 0;

  const payrollOverdueItems = context.recentExpenses.filter(
    (e) => e.category === "PAYROLL" && e.status === "OVERDUE",
  );
  const taxOverdueItems = context.recentExpenses.filter(
    (e) => e.category === "TAX" && e.status === "OVERDUE",
  );
  const rentOverdueItem = context.recentExpenses.find(
    (e) => e.category === "RENT" && e.status === "OVERDUE",
  ) ?? null;

  const payrollOverdue = payrollOverdueItems.length > 0;
  const taxOverdue = taxOverdueItems.length > 0;

  const burnRiskLevel = computeBurnRiskLevel({
    overdueRatio,
    overdueCount: context.overdueCount,
    payrollOverdue,
    taxOverdue,
  });

  const riskWarnings = buildRiskWarnings({
    burnRiskLevel,
    overdueRatio,
    totalOverdueAmount: context.totalOverdueAmount,
    overdueCount: context.overdueCount,
    payrollOverdue,
    taxOverdue,
  });

  const recommendedActions = buildRecommendedActions({
    context,
    payrollOverdueItems,
    taxOverdueItems,
    rentOverdueItem,
  });

  const executiveSummary = buildExecutiveSummary({ context, burnRiskLevel });
  const confidence = computeConfidence(context);
  const hasActiveRisk = burnRiskLevel !== "LOW" || context.overdueCount > 0;

  return {
    burnRiskLevel,
    monthlyBurnRate: context.monthlyBurnRate,
    overdueRatio,
    riskWarnings,
    recommendedActions,
    executiveSummary,
    hasActiveRisk,
    confidence,
  };
}

function computeBurnRiskLevel(input: {
  overdueRatio: number;
  overdueCount: number;
  payrollOverdue: boolean;
  taxOverdue: boolean;
}): BurnRiskLevel {
  if (input.payrollOverdue || input.overdueRatio >= CRITICAL_OVERDUE_RATIO) return "CRITICAL";
  if (input.taxOverdue || input.overdueRatio >= HIGH_OVERDUE_RATIO) return "HIGH";
  if (input.overdueCount >= 1) return "MEDIUM";
  return "LOW";
}

function buildRiskWarnings(input: {
  burnRiskLevel: BurnRiskLevel;
  overdueRatio: number;
  totalOverdueAmount: number;
  overdueCount: number;
  payrollOverdue: boolean;
  taxOverdue: boolean;
}): string[] {
  const warnings: string[] = [];

  if (input.payrollOverdue) {
    warnings.push(
      "Maaş ödemesi gecikmiş — çalışan ilişkisi ve yasal yükümlülük riski altında.",
    );
  }

  if (input.taxOverdue) {
    warnings.push("Vergi borcu gecikmiş — yasal ceza ve faiz riski.");
  }

  if (input.burnRiskLevel === "CRITICAL" && !input.payrollOverdue) {
    warnings.push(
      `Gider riski KRİTİK: toplam giderin %${Math.round(input.overdueRatio * 100)}'i gecikmiş (${formatTRY(input.totalOverdueAmount)}).`,
    );
  } else if (input.burnRiskLevel === "HIGH" && !input.taxOverdue) {
    warnings.push(
      `Gider riski YÜKSEK: ${formatTRY(input.totalOverdueAmount)} tutarında gecikmiş ödeme.`,
    );
  } else if (input.burnRiskLevel === "MEDIUM") {
    warnings.push(
      `${input.overdueCount} gecikmiş gider kaydı var — tedarikçi ilişkisi takip gerekiyor.`,
    );
  }

  return warnings;
}

function buildRecommendedActions(input: {
  context: ExpenseContext;
  payrollOverdueItems: ExpenseContextItem[];
  taxOverdueItems: ExpenseContextItem[];
  rentOverdueItem: ExpenseContextItem | null;
}): string[] {
  const actions: string[] = [];
  const { context, payrollOverdueItems, taxOverdueItems, rentOverdueItem } = input;

  if (payrollOverdueItems.length > 0) {
    const total = payrollOverdueItems.reduce((s, e) => s + e.amount, 0);
    actions.push(`Maaş ödemesini bugün önceliklendir: ${formatTRY(total)}`);
  }

  if (taxOverdueItems.length > 0) {
    const total = taxOverdueItems.reduce((s, e) => s + e.amount, 0);
    actions.push(
      `Vergi borcunu ${formatTRY(total)} için ödeme planı oluştur veya mali danışman ara.`,
    );
  }

  if (rentOverdueItem) {
    const vendor = rentOverdueItem.vendorName ?? "kiraya veren";
    actions.push(`${vendor} ile kira erteleme veya ödeme planı görüşmesi yap.`);
  }

  if (context.overdueCount > 0 && actions.length < 3) {
    actions.push(
      `${context.overdueCount} gecikmiş gider kaydını incele ve ödeme önceliği belirle (toplam ${formatTRY(context.totalOverdueAmount)}).`,
    );
  }

  return actions.slice(0, 4);
}

function buildExecutiveSummary(input: {
  context: ExpenseContext;
  burnRiskLevel: BurnRiskLevel;
}): string {
  const { context, burnRiskLevel } = input;

  const parts: string[] = [];

  parts.push(`Son dönemde toplam ${formatTRY(context.totalExpenseAmount)} gider kaydedildi.`);

  if (context.monthlyBurnRate > 0) {
    parts.push(`Bunun ${formatTRY(context.monthlyBurnRate)}'si tekrar eden giderlerden oluşuyor.`);
  }

  if (context.totalOverdueAmount > 0) {
    parts.push(`${formatTRY(context.totalOverdueAmount)} tutarında gecikmiş gider bulunuyor.`);
  }

  const riskLabel: Record<BurnRiskLevel, string> = {
    LOW: "düşük",
    MEDIUM: "orta",
    HIGH: "YÜKSEK",
    CRITICAL: "KRİTİK",
  };

  parts.push(`Gider riski ${riskLabel[burnRiskLevel]} seviyede.`);

  return parts.join(" ");
}

function computeConfidence(context: ExpenseContext): ExpenseConfidence {
  if (context.recentExpenses.length >= 10) return "HIGH";
  if (context.recentExpenses.length >= 3) return "MEDIUM";
  return "LOW";
}

function buildEmptyIntelligence(): ExpenseIntelligence {
  return {
    burnRiskLevel: "LOW",
    monthlyBurnRate: 0,
    overdueRatio: 0,
    riskWarnings: [],
    recommendedActions: [],
    executiveSummary: "Gider kaydı bulunamadı.",
    hasActiveRisk: false,
    confidence: "LOW",
  };
}

function formatTRY(amount: number): string {
  return `₺${amount.toLocaleString("tr-TR")}`;
}
