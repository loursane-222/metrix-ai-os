import type { ExecutivePresenceSurface } from "@/lib/ai/identity/executive-identity-prompt";
import type {
  LivingBehaviorProfile,
  LivingConversationMode,
  LivingExecutiveSemanticHint,
} from "./contracts";

export type ResolveLivingBehaviorInput = Readonly<{
  userMessage: string;
  surface: ExecutivePresenceSurface;
  hasPriorTurns?: boolean;
  semanticHint?: LivingExecutiveSemanticHint | null;
}>;

const normalize = (value: string): string =>
  value.toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[ı]/g, "i").replace(/[ş]/g, "s").replace(/[ğ]/g, "g").replace(/[ç]/g, "c").replace(/[ö]/g, "o").replace(/[ü]/g, "u");

const contains = (text: string, terms: readonly string[]): boolean =>
  terms.some((term) => text.includes(term));

export function detectLivingConversationMode(
  userMessage: string,
  surface: ExecutivePresenceSurface,
  semanticHint?: LivingExecutiveSemanticHint | null,
): LivingConversationMode {
  if (surface === "repair") return "repair";
  const text = normalize(userMessage);
  if (/\b(sen kimsin|kimsin sen|kendini tanit|metrix nedir)\b/u.test(text)) return "self_identity";
  if (contains(text, ["neler yapabiliyorsun", "ne yapabilirsin", "yeteneklerin", "hangi islemleri"])) return "capability";
  const semanticMode = resolveTrustedSemanticMode(semanticHint);
  if (semanticMode) return semanticMode;
  if (contains(text, ["beni taniyor musun", "benim hakkimda ne biliyorsun", "beni ne kadar taniyorsun"])) return "personal";
  if (contains(text, ["yoruldum", "yorgunum", "bunaldim", "moralim bozuk", "stresliyim", "uzuldum"])) return "emotional";
  if (/\b(olustur|kaydet|gonder|iptal et|guncelle|tamamla)\b/u.test(text)) return "operational";
  if (contains(text, ["meli miyiz", "mali miyiz", "karar", "kanaatin", "dogru hamle", "ne yapalim"])) return "decision";
  if (contains(text, ["musteri", "satis", "tahsilat", "vade", "nakit", "ciro", "ekip", "operasyon", "sirket"])) return "business";
  return "casual";
}

function resolveTrustedSemanticMode(
  hint?: LivingExecutiveSemanticHint | null,
): LivingConversationMode | null {
  if (!hint || hint.confidence !== "high") return null;
  const mapping: Readonly<Record<LivingExecutiveSemanticHint["intent"], LivingConversationMode>> = {
    social_exchange: "casual",
    business_context: "business",
    decision_support: "decision",
    operational_request: "operational",
  };
  return mapping[hint.intent];
}

export function resolveLivingExecutiveBehavior(
  input: ResolveLivingBehaviorInput,
): LivingBehaviorProfile {
  const mode = detectLivingConversationMode(input.userMessage, input.surface, input.semanticHint);
  const spoken = input.surface === "voice" || input.surface === "realtime_voice" || input.surface === "fast_response" || input.surface === "continuity";
  const human = mode === "casual" || mode === "personal" || mode === "emotional";
  const decisive = mode === "decision" || mode === "operational" || mode === "business";

  return Object.freeze({
    authorityId: "living-executive-presence-runtime",
    mode,
    surface: input.surface,
    tone: human ? "calm_human" : "calm_mature",
    ownership: "company_insider",
    directness: mode === "emotional" ? "measured" : "direct",
    warmth: human ? "warm" : "reserved",
    assertiveness: decisive ? "decisive" : mode === "emotional" ? "low" : "balanced",
    responseDensity: spoken || mode === "self_identity" || mode === "casual" || mode === "emotional" ? "brief" : mode === "decision" || mode === "business" ? "substantive" : "compact",
    questioning: mode === "decision" || mode === "operational" || mode === "personal" ? "critical_single" : "none",
    recommendation: mode === "decision" || mode === "business" ? "reasoned_judgment" : mode === "operational" ? "action_posture" : "none",
    disagreement: "calm_when_warranted",
    selfReference: mode === "self_identity" ? "identity_answer" : "only_when_asked",
    capabilityExpression: mode === "capability" || mode === "operational" ? "bounded_operational_scope" : "not_applicable",
    businessRedirection: human ? "never_force" : "follow_user_intent",
    formatting: spoken ? "spoken_plain_text" : "natural_prose",
    continuity: input.hasPriorTurns ? "preserve_without_reintroduction" : "preserve_character",
  });
}

export function projectLivingBehaviorPrompt(profile: LivingBehaviorProfile): string {
  const instructions = [
    "LIVING EXECUTIVE BEHAVIOR (bu turnün davranış biçimi):",
    `- Mod: ${profile.mode}; ton sakin ve olgun, duruş şirketin içinden sahiplenen bir yönetici.`,
    profile.responseDensity === "brief" ? "- Kısa, doğal ve doğrudan cevap ver." : "- Doğrudan cevap ver; kanaat gerekiyorsa gerekçesiyle sahiplen.",
  ];
  if (profile.businessRedirection === "never_force") instructions.push("- Gündelik veya insani mesajı zorla iş analizine, KPI'a ya da aksiyon planına çevirme.");
  if (profile.capabilityExpression === "bounded_operational_scope") instructions.push("- Operasyon kapsamını yönetici diliyle anlat; gerçek işlemi yalnız doğrulanmış yetki, bağlantı ve action sonucuna bağla.");
  if (profile.selfReference === "identity_answer") instructions.push("- Kimliği tek doğal cümlede METRIX ve şirketin AI Genel Müdürü olarak söyle; teknik model veya yetenek listesi ekleme.");
  if (profile.recommendation === "reasoned_judgment") instructions.push("- Dış danışman dili yerine kendi yönetici kanaatini, gerekçesini ve kritik riski ver.");
  if (profile.formatting === "spoken_plain_text") instructions.push("- Konuşma dili kullan; markdown, başlık ve rapor formatı kullanma.");
  if (profile.continuity === "preserve_without_reintroduction") instructions.push("- Aynı karakteri koru; kendini yeniden tanıtma veya yeni oturum açılışı yapma.");
  return instructions.join("\n");
}
