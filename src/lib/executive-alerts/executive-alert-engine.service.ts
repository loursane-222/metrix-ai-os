import type {
  AlertCategory,
  AlertSeverity,
  AlertSourceSystem,
  BuildExecutiveAlertsInput,
  ExecutiveAlert,
  ExecutiveAlertBundle,
} from "./executive-alert.types";
import type { ForecastRiskSignal, ForecastRiskType } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { NewsImpact } from "@/lib/daily-briefing/daily-briefing.types";

const STALE_ACTION_HIGH_DAYS = 14;
const STALE_ACTION_WATCH_DAYS = 7;

export function buildExecutiveAlerts(
  input: BuildExecutiveAlertsInput,
): ExecutiveAlertBundle {
  const rawAlerts: ExecutiveAlert[] = [];

  collectForecastingAlerts(rawAlerts, input);
  collectBriefingAlerts(rawAlerts, input);
  collectPaymentAlerts(rawAlerts, input);
  collectCollectionActionAlerts(rawAlerts, input);

  const deduped = deduplicateAlerts(rawAlerts);

  const criticalAlerts = deduped.filter((a) => a.severity === "CRITICAL");
  const highAlerts = deduped.filter((a) => a.severity === "HIGH");
  const watchAlerts = deduped.filter((a) => a.severity === "WATCH");

  return {
    organizationId: input.organizationId,
    generatedAt: new Date().toISOString(),
    criticalAlerts,
    highAlerts,
    watchAlerts,
    totalCount: deduped.length,
    hasActionableItems: deduped.some((a) => a.isActionable),
  };
}

// ─── Forecasting Alerts ───────────────────────────────────────────────────────

function collectForecastingAlerts(
  out: ExecutiveAlert[],
  input: BuildExecutiveAlertsInput,
): void {
  const signals = input.executiveForecast?.signals ?? [];
  for (const signal of signals) {
    if (signal.riskLevel === "LOW") continue;
    const alert = forecastSignalToAlert(signal);
    if (alert) out.push(alert);
  }
}

function forecastSignalToAlert(signal: ForecastRiskSignal): ExecutiveAlert | null {
  const category = forecastTypeToCategory(signal.riskType);
  if (!category) return null;

  const severity = forecastLevelToSeverity(signal.riskLevel);
  if (!severity) return null;

  return makeAlert({
    id: `${category}_forecasting`,
    severity,
    category,
    source: "forecasting",
    headline: signal.headline,
    actionableStep: signal.actionableStep ?? null,
  });
}

function forecastTypeToCategory(type: ForecastRiskType): AlertCategory | null {
  const map: Record<ForecastRiskType, AlertCategory> = {
    COLLECTION_RISK: "COLLECTION_PRESSURE",
    CASH_FLOW: "CASH_FLOW_RISK",
    QUOTE_CONVERSION: "QUOTE_PIPELINE_RISK",
    CURRENCY_RISK: "CURRENCY_EXPOSURE",
    EXECUTION_RISK: "EXECUTION_GAP",
    GOAL_GAP: "STRATEGIC_HEALTH",
  };
  return map[type] ?? null;
}

function forecastLevelToSeverity(level: string): AlertSeverity | null {
  if (level === "CRITICAL") return "CRITICAL";
  if (level === "HIGH") return "HIGH";
  if (level === "WATCH") return "WATCH";
  return null;
}

// ─── Briefing Alerts ──────────────────────────────────────────────────────────

function collectBriefingAlerts(
  out: ExecutiveAlert[],
  input: BuildExecutiveAlertsInput,
): void {
  const pkg = input.latestBriefing;
  if (!pkg) return;

  const today = new Date().toISOString().slice(0, 10);
  const isFresh = pkg.briefingDate === today;

  for (const item of pkg.kritikItems.slice(0, 3)) {
    const alert = briefingItemToAlert(item, isFresh);
    if (alert) out.push(alert);
  }
}

function briefingItemToAlert(item: NewsImpact, isFresh: boolean): ExecutiveAlert | null {
  const hasFinancialImpact = item.finansal_etki.yon !== "NOTR";
  if (!hasFinancialImpact && item.ekonomik_etki.yon !== "NEGATIF") return null;

  const severity: AlertSeverity =
    isFresh && item.finansal_etki.yon === "NEGATIF" && item.impact_score >= 0.80
      ? "CRITICAL"
      : isFresh
        ? "HIGH"
        : "WATCH";

  const id = `MARKET_RISK_briefing_${item.headline.slice(0, 30).replace(/\s+/g, "_")}`;

  return makeAlert({
    id,
    severity,
    category: "MARKET_RISK",
    source: "briefing",
    headline: item.headline,
    actionableStep: item.yonetim_onerisi || null,
  });
}

// ─── Payment Intelligence Alerts ─────────────────────────────────────────────

function collectPaymentAlerts(
  out: ExecutiveAlert[],
  input: BuildExecutiveAlertsInput,
): void {
  const intel = input.paymentIntelligence;
  if (!intel || !intel.hasActiveRisk) return;

  const severity: AlertSeverity =
    intel.cashRiskLevel === "CRITICAL"
      ? "CRITICAL"
      : intel.cashRiskLevel === "HIGH"
        ? "HIGH"
        : "WATCH";

  if (severity === "WATCH" && intel.cashRiskLevel !== "MEDIUM") return;

  const top = intel.topPriorityItem;
  const headline = top
    ? `Tahsilat baskisi: ${top.customerName} ${top.daysPastDue} gun gecikti, kalan ₺${top.remaining.toLocaleString("tr-TR")}.`
    : intel.executiveSummary;

  const actionableStep =
    intel.nextBestActions.length > 0 ? intel.nextBestActions[0] : null;

  out.push(
    makeAlert({
      id: "COLLECTION_PRESSURE_payment_intelligence",
      severity,
      category: "COLLECTION_PRESSURE",
      source: "payment_intelligence",
      headline,
      actionableStep,
    }),
  );
}

// ─── Collection Action Alerts ─────────────────────────────────────────────────

function collectCollectionActionAlerts(
  out: ExecutiveAlert[],
  input: BuildExecutiveAlertsInput,
): void {
  const ctx = input.collectionActionContext;
  if (!ctx || ctx.items.length === 0) return;

  const highStaleItems = ctx.items.filter(
    (item) => item.daysOpen >= STALE_ACTION_HIGH_DAYS && item.status === "OPEN",
  );
  const watchStaleItems = ctx.items.filter(
    (item) =>
      item.daysOpen >= STALE_ACTION_WATCH_DAYS &&
      item.daysOpen < STALE_ACTION_HIGH_DAYS &&
      item.status === "OPEN",
  );

  if (highStaleItems.length > 0) {
    const first = highStaleItems[0];
    out.push(
      makeAlert({
        id: "EXECUTION_GAP_collection_action",
        severity: "HIGH",
        category: "EXECUTION_GAP",
        source: "collection_action",
        headline: `${highStaleItems.length} tahsilat aksiyonu ${STALE_ACTION_HIGH_DAYS}+ gundur hareketsiz; en kritik: ${first.customerName} — ${first.paymentTitle}.`,
        actionableStep: `${first.customerName} aksiyonunu guncelle veya kapat.`,
      }),
    );
  } else if (watchStaleItems.length > 0) {
    const first = watchStaleItems[0];
    out.push(
      makeAlert({
        id: "EXECUTION_GAP_collection_action",
        severity: "WATCH",
        category: "EXECUTION_GAP",
        source: "collection_action",
        headline: `${watchStaleItems.length} tahsilat aksiyonu ${STALE_ACTION_WATCH_DAYS}+ gundur takipsiz; en eski: ${first.customerName}.`,
        actionableStep: `${first.customerName} aksiyon durumunu guncelle.`,
      }),
    );
  }
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicateAlerts(alerts: ExecutiveAlert[]): ExecutiveAlert[] {
  const SEVERITY_RANK: Record<AlertSeverity, number> = {
    CRITICAL: 3,
    HIGH: 2,
    WATCH: 1,
  };

  const map = new Map<string, ExecutiveAlert>();

  for (const alert of alerts) {
    const existing = map.get(alert.id);
    if (!existing || SEVERITY_RANK[alert.severity] > SEVERITY_RANK[existing.severity]) {
      map.set(alert.id, alert);
    }
  }

  return [...map.values()].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity],
  );
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeAlert(input: {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  source: AlertSourceSystem;
  headline: string;
  actionableStep: string | null;
}): ExecutiveAlert {
  return {
    id: input.id,
    severity: input.severity,
    category: input.category,
    source: input.source,
    headline: input.headline,
    actionableStep: input.actionableStep,
    isActionable: input.actionableStep !== null,
  };
}
