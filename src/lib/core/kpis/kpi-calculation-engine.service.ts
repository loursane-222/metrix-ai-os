import { prisma } from "@/lib/core/shared/prisma";
import { getAccountingSummary, type AccountingMetric } from "@/lib/accounting/accounting-summary";
import { computeCapacity } from "@/lib/company/business-overview-synthesis.service";

import type { KpiCalculationMethod, KpiComputedValue, KpiFinanceMetric, KpiSourceDomain } from "./kpi-calculation.types";

const FINANCE_METRIC_LABELS: Record<KpiFinanceMetric, string> = {
  CASH_POSITION: "Nakit pozisyonu",
  MONTHLY_REVENUE: "Aylık ciro",
  MONTHLY_EXPENSE: "Aylık gider",
  TOTAL_RECEIVABLE: "Toplam alacak",
  TOTAL_PAYABLE: "Toplam borç",
};

export function resolveKpiPeriodWindow(period: string, now: Date): Readonly<{ start: Date; end: Date }> {
  const normalized = period.trim().toUpperCase();
  if (normalized === "YEARLY") {
    return { start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), end: new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)) };
  }
  if (normalized === "QUARTERLY") {
    const quarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
    return { start: new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth, 1)), end: new Date(Date.UTC(now.getUTCFullYear(), quarterStartMonth + 3, 1)) };
  }
  // MONTHLY is the default window — it also covers "CUSTOM" and any other
  // free-form period string, since KpiDefinition.period has no enum
  // constraint at the schema level.
  return { start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) };
}

export async function computeKpiCurrentValue(
  organizationId: string,
  calculationMethod: KpiCalculationMethod,
  period: string,
  now = new Date(),
): Promise<KpiComputedValue> {
  const measuredAt = now.toISOString();

  switch (calculationMethod.type) {
    case "FINANCE_METRIC": {
      const summary = await getAccountingSummary(organizationId, now);
      const metricKey = FINANCE_METRIC_TO_SUMMARY_KEY[calculationMethod.metric];
      return fromAccountingMetric(summary.metrics[metricKey], "finance", `Finansal özet — ${FINANCE_METRIC_LABELS[calculationMethod.metric]}`, measuredAt);
    }
    case "SALES_REVENUE": {
      const { start, end } = resolveKpiPeriodWindow(period, now);
      const invoices = await prisma.invoice.findMany({
        where: { organizationId, status: { in: ["SENT", "PAID"] }, createdAt: { gte: start, lt: end } },
        select: { totalAmount: true, currency: true },
      });
      return fromAmounts(invoices.map((row) => ({ currency: row.currency, amount: Number(row.totalAmount) })), "sales", "Dönem içi fatura toplamı (gönderilmiş + ödenmiş)", measuredAt);
    }
    case "COLLECTIONS_TOTAL": {
      const { start, end } = resolveKpiPeriodWindow(period, now);
      const payments = await prisma.payment.findMany({
        where: { organizationId, paidAt: { gte: start, lt: end } },
        select: { paidAmount: true, currency: true },
      });
      return fromAmounts(payments.map((row) => ({ currency: row.currency, amount: Number(row.paidAmount) })), "collections", "Dönem içi gerçekleşen tahsilat toplamı", measuredAt);
    }
    case "PRODUCTION_UTILIZATION": {
      const capacity = await computeCapacity(organizationId, now);
      const available = capacity.utilizationRatio !== null;
      return {
        available, value: capacity.utilizationRatio, unit: "RATIO", measuredAt, sourceDomain: "production",
        calculationMethodLabel: "Üretilen/planlanan miktar oranı (aktif üretim emirleri)",
        confidence: available ? "MEASURED" : "UNAVAILABLE", verificationStatus: available ? "VERIFIED" : "NO_DATA",
        note: available ? undefined : "Planlanan miktarı olan aktif üretim emri yok.",
      };
    }
    case "PRODUCTION_LATE_ORDER_COUNT": {
      const capacity = await computeCapacity(organizationId, now);
      return {
        available: true, value: capacity.lateOrderCount, unit: "COUNT", measuredAt, sourceDomain: "production",
        calculationMethodLabel: "Planlanan bitiş tarihini geçen aktif üretim emri sayısı",
        confidence: "MEASURED", verificationStatus: "VERIFIED",
      };
    }
    case "CUSTOMER_ACTIVE_COUNT": {
      const count = await prisma.customer.count({ where: { organizationId, status: "ACTIVE" } });
      return {
        available: true, value: count, unit: "COUNT", measuredAt, sourceDomain: "customer",
        calculationMethodLabel: "Aktif müşteri sayısı", confidence: "MEASURED", verificationStatus: "VERIFIED",
      };
    }
    case "TASK_COMPLETION_RATE": {
      const { start, end } = resolveKpiPeriodWindow(period, now);
      const tasks = await prisma.task.findMany({
        where: { organizationId, createdAt: { gte: start, lt: end }, status: { in: ["DONE", "OPEN"] } },
        select: { status: true },
      });
      const done = tasks.filter((row) => row.status === "DONE").length;
      const available = tasks.length > 0;
      return {
        available, value: available ? done / tasks.length : null, unit: "RATIO", measuredAt, sourceDomain: "task",
        calculationMethodLabel: "Dönem içi oluşturulan görevlerden tamamlanma oranı (iptaller hariç)",
        confidence: available ? "MEASURED" : "UNAVAILABLE", verificationStatus: available ? "VERIFIED" : "NO_DATA",
        note: available ? undefined : "Bu dönemde oluşturulmuş görev yok.",
      };
    }
  }
}

const FINANCE_METRIC_TO_SUMMARY_KEY: Record<KpiFinanceMetric, "cashPosition" | "monthlyRevenue" | "monthlyExpense" | "totalReceivable" | "totalPayable"> = {
  CASH_POSITION: "cashPosition",
  MONTHLY_REVENUE: "monthlyRevenue",
  MONTHLY_EXPENSE: "monthlyExpense",
  TOTAL_RECEIVABLE: "totalReceivable",
  TOTAL_PAYABLE: "totalPayable",
};

function fromAccountingMetric(metric: AccountingMetric, sourceDomain: KpiSourceDomain, label: string, measuredAt: string): KpiComputedValue {
  const primary = metric.amounts[0];
  return {
    available: metric.available,
    value: metric.available ? (primary?.amount ?? 0) : null,
    unit: "CURRENCY",
    currency: primary?.currency,
    amounts: metric.amounts,
    measuredAt,
    sourceDomain,
    calculationMethodLabel: label,
    confidence: metric.available ? "MEASURED" : "UNAVAILABLE",
    verificationStatus: metric.available ? "VERIFIED" : "NO_DATA",
    note: metric.available ? undefined : metric.note,
  };
}

function fromAmounts(rows: readonly Readonly<{ currency: string; amount: number }>[], sourceDomain: KpiSourceDomain, label: string, measuredAt: string): KpiComputedValue {
  const totalsByCurrency = new Map<string, number>();
  for (const row of rows) totalsByCurrency.set(row.currency, (totalsByCurrency.get(row.currency) ?? 0) + row.amount);
  const amounts = [...totalsByCurrency.entries()].map(([currency, amount]) => ({ currency, amount }));
  const primary = amounts[0];
  // An empty result set within the period is a real, measured zero (no
  // invoices/payments happened) — not missing data, so this always reports
  // MEASURED/VERIFIED rather than falling back to UNAVAILABLE.
  return {
    available: true,
    value: primary?.amount ?? 0,
    unit: "CURRENCY",
    currency: primary?.currency,
    amounts,
    measuredAt,
    sourceDomain,
    calculationMethodLabel: label,
    confidence: "MEASURED",
    verificationStatus: "VERIFIED",
  };
}
