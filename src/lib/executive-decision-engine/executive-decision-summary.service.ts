import type {
  ExecutiveDecision,
  ExecutiveDecisionCategory,
  ExecutiveDecisionPromptSummary,
} from "./executive-decision-engine.types";

export function buildExecutiveDecisionPromptSummary(
  decision: ExecutiveDecision,
): ExecutiveDecisionPromptSummary {
  return {
    priority: decision.priority,
    category: decision.category,
    decisionLine: decision.title,
    firstAction: decision.firstAction,
    riskLine: decision.risks[0] ?? null,
    confidence: decision.confidence,
    evidenceRefs: decision.evidenceRefs,
    sourceSignals: decision.sourceSignals,
    evidenceReliability: decision.evidenceReliability,
  };
}

export function buildExecutiveDecisionSummary(
  decision: ExecutiveDecision,
): string {
  return `${decision.title} İlk adım: ${decision.firstAction}`;
}

export function defaultFirstAction(category: ExecutiveDecisionCategory): string {
  const map: Record<ExecutiveDecisionCategory, string> = {
    CASH: "Bugün nakit girişi ve geciken alacakları tek listede netleştir.",
    COLLECTION: "Bugün en eski veya en yüksek tutarlı tahsilata tarih al.",
    SALES: "Bugün sıcak tekliflerde kapanış veya takip tarihini netleştir.",
    EXECUTION: "Bugün bekleyen aksiyonlarda sahiplik ve tarih netleştir.",
    DECISION_FOLLOW_UP: "Bugün açık kararların sonucunu netleştir.",
    MARKET: "Bugün piyasa etkisini fiyatlama, teklif ve nakit kararlarına yansıt.",
    DATA_QUALITY: "Bugün eksik veri kaynaklarını ayır ve kesin olmayan yorumları sınırla.",
    STRATEGY: "Bugün ana hedefi ve karar kriterini netleştir.",
    PEOPLE: "Bugün ekip tarafında rol, sahiplik ve beklenen çıktıyı netleştir.",
    CUSTOMER: "Bugün kritik müşteri için sahiplik, sonraki adım ve takip tarihini netleştir.",
  };

  return map[category];
}

export function categoryLabel(category: ExecutiveDecisionCategory): string {
  const map: Record<ExecutiveDecisionCategory, string> = {
    CASH: "nakit",
    COLLECTION: "tahsilat",
    SALES: "satış",
    EXECUTION: "icra",
    DECISION_FOLLOW_UP: "karar takibi",
    MARKET: "piyasa",
    DATA_QUALITY: "veri kalitesi",
    STRATEGY: "strateji",
    PEOPLE: "ekip",
    CUSTOMER: "müşteri",
  };

  return map[category];
}
