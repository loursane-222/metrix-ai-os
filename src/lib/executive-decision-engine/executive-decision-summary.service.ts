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
  };
}

export function buildExecutiveDecisionSummary(
  decision: ExecutiveDecision,
): string {
  return `${decision.title} İlk adım: ${decision.firstAction}`;
}

export function defaultFirstAction(category: ExecutiveDecisionCategory): string {
  const map: Record<ExecutiveDecisionCategory, string> = {
    CASH: "Bugun nakit girisi ve geciken alacaklari tek listede netlestir.",
    COLLECTION: "Bugun en eski veya en yuksek tutarli tahsilata tarih al.",
    SALES: "Bugun sicak tekliflerde kapanis veya takip tarihini netlestir.",
    EXECUTION: "Bugun bekleyen aksiyonlarda sahiplik ve tarih netlestir.",
    DECISION_FOLLOW_UP: "Bugun acik kararlarin sonucunu netlestir.",
    MARKET: "Bugun piyasa etkisini fiyatlama, teklif ve nakit kararlarina yansit.",
    DATA_QUALITY: "Bugun eksik veri kaynaklarini ayir ve kesin olmayan yorumlari sinirla.",
    STRATEGY: "Bugun ana hedefi ve karar kriterini netlestir.",
    PEOPLE: "Bugun ekip tarafinda rol, sahiplik ve beklenen ciktiyi netlestir.",
    CUSTOMER: "Bugun kritik musteri icin sahiplik, sonraki adim ve takip tarihini netlestir.",
  };

  return map[category];
}

export function categoryLabel(category: ExecutiveDecisionCategory): string {
  const map: Record<ExecutiveDecisionCategory, string> = {
    CASH: "nakit",
    COLLECTION: "tahsilat",
    SALES: "satis",
    EXECUTION: "icra",
    DECISION_FOLLOW_UP: "karar takibi",
    MARKET: "piyasa",
    DATA_QUALITY: "veri kalitesi",
    STRATEGY: "strateji",
    PEOPLE: "ekip",
    CUSTOMER: "musteri",
  };

  return map[category];
}

