import type {
  CustomerHealthIntelligence,
  CustomerHealthPromptSummary,
  CustomerHealthRecommendedAction,
} from "./customer-health-intelligence.types";

const ACTION_PRIORITY: Record<CustomerHealthRecommendedAction, number> = {
  COLLECTION_MEETING: 0,
  REENGAGEMENT_CALL: 1,
  SEND_QUOTE: 2,
  CLOSE_WATCH: 3,
  WATCH_AND_WAIT: 4,
};

const ACTION_LABEL: Record<CustomerHealthRecommendedAction, string> = {
  COLLECTION_MEETING: "tahsilat görüşmesi",
  REENGAGEMENT_CALL: "yeniden kazanım görüşmesi",
  SEND_QUOTE: "yeni teklif hazırla",
  CLOSE_WATCH: "yakın takip",
  WATCH_AND_WAIT: "",
};

export function buildCustomerHealthPromptSummary(
  intelligence: CustomerHealthIntelligence,
): CustomerHealthPromptSummary {
  const topCritical = intelligence.criticalCustomers[0] ?? null;
  const topAtRisk = intelligence.atRiskCustomers[0] ?? null;

  const byOpportunityScore = (a: { opportunityScore: number }, b: { opportunityScore: number }) =>
    b.opportunityScore - a.opportunityScore;

  const topUpsellOpportunities = intelligence.profiles
    .filter((p) => p.upsellOpportunity)
    .sort(byOpportunityScore)
    .slice(0, 2)
    .map((p) => p.customerName);

  const topRepurchaseCandidates = intelligence.profiles
    .filter((p) => p.repurchaseCandidate)
    .sort(byOpportunityScore)
    .slice(0, 2)
    .map((p) => p.customerName);

  const topRecommendedActions = intelligence.profiles
    .filter((p) => p.recommendedAction !== "WATCH_AND_WAIT")
    .sort((a, b) => ACTION_PRIORITY[a.recommendedAction] - ACTION_PRIORITY[b.recommendedAction])
    .slice(0, 3)
    .map((p) => `${p.customerName}: ${ACTION_LABEL[p.recommendedAction]}`);

  return {
    distribution: intelligence.distribution,
    criticalCount: intelligence.criticalCustomers.length,
    atRiskCount: intelligence.atRiskCustomers.length,
    watchCount: intelligence.watchCustomers.length,
    topCriticalName: topCritical?.customerName ?? null,
    topAtRiskName: topAtRisk?.customerName ?? null,
    topInsights: intelligence.topInsights.slice(0, 3),
    topUpsellOpportunities,
    topRepurchaseCandidates,
    topRecommendedActions,
    confidence: intelligence.confidence,
  };
}
