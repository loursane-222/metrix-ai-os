// Real, closed set of computable KPI formulas — one per canonical source
// domain named in the Goals & KPI domain constitution's Evidence Policy
// (§11: Finance, Sales, Production, Customer, Task). A KpiDefinition whose
// calculationMethod does not parse into one of these is rejected at
// creation (see kpi.service.ts) rather than stored as opaque, uninterpreted
// JSON — the exact gap the 2026-08-23 domain audit flagged.
export type KpiFinanceMetric = "CASH_POSITION" | "MONTHLY_REVENUE" | "MONTHLY_EXPENSE" | "TOTAL_RECEIVABLE" | "TOTAL_PAYABLE";

export type KpiCalculationMethod =
  | Readonly<{ type: "FINANCE_METRIC"; metric: KpiFinanceMetric }>
  | Readonly<{ type: "SALES_REVENUE" }>
  | Readonly<{ type: "COLLECTIONS_TOTAL" }>
  | Readonly<{ type: "PRODUCTION_UTILIZATION" }>
  | Readonly<{ type: "PRODUCTION_LATE_ORDER_COUNT" }>
  | Readonly<{ type: "CUSTOMER_ACTIVE_COUNT" }>
  | Readonly<{ type: "TASK_COMPLETION_RATE" }>;

export type KpiSourceDomain = "finance" | "sales" | "collections" | "production" | "customer" | "task";

// Evidence Policy (§11) requires every performance figure to carry: Source
// Domain, Measurement Time, Calculation Method, Confidence, Verification
// Status — this type is that contract, not a display convenience.
export type KpiComputedValue = Readonly<{
  available: boolean;
  value: number | null;
  unit: "CURRENCY" | "RATIO" | "COUNT";
  currency?: string;
  amounts?: readonly Readonly<{ currency: string; amount: number }>[];
  measuredAt: string;
  sourceDomain: KpiSourceDomain;
  calculationMethodLabel: string;
  confidence: "MEASURED" | "UNAVAILABLE";
  verificationStatus: "VERIFIED" | "NO_DATA";
  note?: string;
}>;

const FINANCE_METRICS = new Set<string>(["CASH_POSITION", "MONTHLY_REVENUE", "MONTHLY_EXPENSE", "TOTAL_RECEIVABLE", "TOTAL_PAYABLE"]);
const SIMPLE_METHOD_TYPES = new Set<string>(["SALES_REVENUE", "COLLECTIONS_TOTAL", "PRODUCTION_UTILIZATION", "PRODUCTION_LATE_ORDER_COUNT", "CUSTOMER_ACTIVE_COUNT", "TASK_COMPLETION_RATE"]);

export const SUPPORTED_KPI_CALCULATION_METHODS = Object.freeze([
  "FINANCE_METRIC (metric: CASH_POSITION | MONTHLY_REVENUE | MONTHLY_EXPENSE | TOTAL_RECEIVABLE | TOTAL_PAYABLE)",
  "SALES_REVENUE", "COLLECTIONS_TOTAL", "PRODUCTION_UTILIZATION", "PRODUCTION_LATE_ORDER_COUNT",
  "CUSTOMER_ACTIVE_COUNT", "TASK_COMPLETION_RATE",
]);

// The formula (calculationMethod) and its source domain were never
// independent facts — every one of the 7 supported formulas already implies
// exactly one source domain (see computeKpiCurrentValue's own per-case
// `sourceDomain`). Deriving it here, rather than trusting a second,
// separately-supplied field, is what let sourceDomainsJson go from
// "required but silently ignored, could contradict calculationMethod" to
// server-computed and therefore always consistent with the formula it
// describes.
export function deriveKpiSourceDomain(method: KpiCalculationMethod): KpiSourceDomain {
  switch (method.type) {
    case "FINANCE_METRIC": return "finance";
    case "SALES_REVENUE": return "sales";
    case "COLLECTIONS_TOTAL": return "collections";
    case "PRODUCTION_UTILIZATION":
    case "PRODUCTION_LATE_ORDER_COUNT": return "production";
    case "CUSTOMER_ACTIVE_COUNT": return "customer";
    case "TASK_COMPLETION_RATE": return "task";
  }
}

export function parseKpiCalculationMethod(value: unknown): KpiCalculationMethod | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (type === "FINANCE_METRIC") {
    return typeof record.metric === "string" && FINANCE_METRICS.has(record.metric)
      ? { type: "FINANCE_METRIC", metric: record.metric as KpiFinanceMetric }
      : null;
  }
  if (typeof type === "string" && SIMPLE_METHOD_TYPES.has(type)) return { type } as KpiCalculationMethod;
  return null;
}

export function formatKpiComputedValue(computed: KpiComputedValue): string {
  if (!computed.available || computed.value === null) return computed.note ?? "Veri yok";
  if (computed.unit === "CURRENCY") {
    const primary = new Intl.NumberFormat("tr-TR", { style: "currency", currency: computed.currency ?? "TRY", maximumFractionDigits: 0 }).format(computed.value);
    const extraCurrencyCount = (computed.amounts?.length ?? 1) - 1;
    return extraCurrencyCount > 0 ? `${primary} (+${extraCurrencyCount} diğer para birimi)` : primary;
  }
  if (computed.unit === "RATIO") return `%${Math.round(computed.value * 100)}`;
  return new Intl.NumberFormat("tr-TR").format(computed.value);
}
