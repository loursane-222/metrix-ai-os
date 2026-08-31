import OpenAI from "openai";
import { CONVERSATION_UNDERSTANDING_SYSTEM_PROMPT } from "./conversation-understanding.prompt";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import {
  ARTIFACT_DATASET_INTENTS,
  ARTIFACT_PERIOD_INTENTS,
  type ActionExpectation,
  type CompanyRelevance,
  type ConfidenceLevel,
  type ConversationKind,
  type ConversationUnderstanding,
  type ConversationUnderstandingInput,
  type SuggestedHandling,
  type UserMotivation,
} from "./conversation-understanding.types";

const CONVERSATION_UNDERSTANDING_MODEL = "gpt-4.1-mini";

const DEFAULT_CLARIFICATION_QUESTION = "Bunu biraz daha açabilir misin?";

const VALID_CONVERSATION_KINDS: ConversationKind[] = [
  "general_chat", "company_related", "mixed", "unclear",
];
const VALID_MOTIVATIONS: UserMotivation[] = [
  "bilgi_almak", "sohbet_etmek", "karar_destegi",
  "kayit_islem", "planlama", "belirsiz",
];
const VALID_RELEVANCE: CompanyRelevance[] = ["none", "low", "medium", "high"];
const VALID_ACTION: ActionExpectation[] = ["none", "possible", "explicit"];
const VALID_CONFIDENCE: ConfidenceLevel[] = ["low", "medium", "high"];
const VALID_HANDLING: SuggestedHandling[] = [
  "answer_only", "ask_clarification", "executive_reasoning", "passive_note",
];

// Servis anlayamadığında sessizce answer_only dönmek yanlış cevap riskini artırır.
// Fallback her zaman netleştirme ister.
const SAFE_FALLBACK: ConversationUnderstanding = {
  conversationKind: "unclear",
  userMotivation: "belirsiz",
  companyRelevance: "none",
  actionExpectation: "none",
  confidence: "low",
  shouldAskClarification: true,
  clarificationQuestion: DEFAULT_CLARIFICATION_QUESTION,
  shouldInvokeExecutiveBrain: false,
  suggestedHandling: "ask_clarification",
  businessNavigation: null,
  workspaceControl: null,
  externalEvidenceNeed: null,
  artifactRequest: null,
  reasoning: {
    summary: "Conversation understanding servisi çıktı üretemedi; güvenli varsayılan kullanıldı.",
    observations: [],
    uncertainty: ["LLM çağrısı başarısız oldu veya geçersiz JSON döndü."],
    whyThisHandling: "Hata durumunda en güvenli yol: bağlamı netleştir, işlem yapma.",
  },
};

function isValidEnum<T extends string>(value: unknown, valid: T[]): value is T {
  return typeof value === "string" && (valid as string[]).includes(value);
}

function validateUnderstanding(raw: unknown): ConversationUnderstanding | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  if (!isValidEnum(r.conversationKind, VALID_CONVERSATION_KINDS)) return null;
  if (!isValidEnum(r.userMotivation, VALID_MOTIVATIONS)) return null;
  if (!isValidEnum(r.companyRelevance, VALID_RELEVANCE)) return null;
  if (!isValidEnum(r.actionExpectation, VALID_ACTION)) return null;
  if (!isValidEnum(r.confidence, VALID_CONFIDENCE)) return null;
  if (typeof r.shouldAskClarification !== "boolean") return null;
  if (typeof r.shouldInvokeExecutiveBrain !== "boolean") return null;
  if (!isValidEnum(r.suggestedHandling, VALID_HANDLING)) return null;
  const navigation = validateBusinessNavigation(r.businessNavigation);
  if (r.businessNavigation !== null && navigation === null) return null;
  if (r.workspaceControl !== undefined && r.workspaceControl !== null && r.workspaceControl !== "close") return null;
  const externalEvidenceNeed = validateExternalEvidenceNeed(r.externalEvidenceNeed);
  if (r.externalEvidenceNeed !== undefined && r.externalEvidenceNeed !== null && externalEvidenceNeed === null) return null;
  const artifactRequest = validateArtifactRequest(r.artifactRequest);
  if (r.artifactRequest !== undefined && r.artifactRequest !== null && artifactRequest === null) return null;

  const rsn = r.reasoning;
  if (!rsn || typeof rsn !== "object") return null;
  const rs = rsn as Record<string, unknown>;
  if (typeof rs.summary !== "string") return null;
  if (!Array.isArray(rs.observations)) return null;
  if (!Array.isArray(rs.uncertainty)) return null;
  if (typeof rs.whyThisHandling !== "string") return null;

  const clarificationQuestion =
    typeof r.clarificationQuestion === "string" && r.clarificationQuestion.trim()
      ? r.clarificationQuestion
      : r.shouldAskClarification === true
        ? DEFAULT_CLARIFICATION_QUESTION
        : undefined;

  return {
    conversationKind: r.conversationKind,
    userMotivation: r.userMotivation,
    companyRelevance: r.companyRelevance,
    actionExpectation: r.actionExpectation,
    confidence: r.confidence,
    shouldAskClarification: r.shouldAskClarification,
    clarificationQuestion,
    shouldInvokeExecutiveBrain: r.shouldInvokeExecutiveBrain,
    suggestedHandling: r.suggestedHandling,
    businessNavigation: navigation,
    workspaceControl: r.workspaceControl === "close" ? "close" : null,
    externalEvidenceNeed,
    artifactRequest,
    reasoning: {
      summary: rs.summary,
      observations: rs.observations.filter((o): o is string => typeof o === "string"),
      uncertainty: rs.uncertainty.filter((u): u is string => typeof u === "string"),
      whyThisHandling: rs.whyThisHandling,
    },
  };
}

function validateBusinessNavigation(value: unknown): ConversationUnderstanding["businessNavigation"] {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.operation !== "NAVIGATE") return null;
  if (!["company", "customer", "offer", "product", "task", "calendar", "accounting", "team", "report", "document", "kpi", "stock", "order", "invoice", "payment", "supplier", "performance"].includes(String(item.domain))) return null;
  if (!["root", "list", "detail", "edit", "create"].includes(String(item.target))) return null;
  if (item.entityReference !== null && typeof item.entityReference !== "string") return null;
  if (item.calendarView !== undefined && item.calendarView !== null && !["day", "week", "month"].includes(String(item.calendarView))) return null;
  if (item.calendarDate !== undefined && item.calendarDate !== null && !isValidCalendarDateRequest(item.calendarDate)) return null;
  return item as ConversationUnderstanding["businessNavigation"];
}

const VALID_EXTERNAL_EVIDENCE_CAPABILITIES = [
  "WEB_SEARCH", "CURRENT_NEWS", "COMPANY_RESEARCH",
  "CURRENCY", "WEATHER", "PLACES", "ROUTES",
];

function validateCurrencyParams(value: unknown): { amount: number; base: string; quote: string } | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.amount !== "number" || !Number.isFinite(p.amount) || p.amount <= 0) return null;
  if (typeof p.base !== "string" || !/^[A-Za-z]{3}$/.test(p.base)) return null;
  if (typeof p.quote !== "string" || !/^[A-Za-z]{3}$/.test(p.quote)) return null;
  return { amount: p.amount, base: p.base.toUpperCase(), quote: p.quote.toUpperCase() };
}

function validateWeatherParams(value: unknown): { location: string; when: "today" | "tomorrow" } | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.location !== "string" || !p.location.trim()) return null;
  if (p.when !== "today" && p.when !== "tomorrow") return null;
  return { location: p.location, when: p.when };
}

function validatePlacesParams(value: unknown): { query: string; near: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.query !== "string" || !p.query.trim()) return null;
  if (p.near !== null && p.near !== undefined && typeof p.near !== "string") return null;
  return { query: p.query, near: (p.near as string | null | undefined) ?? null };
}

function validateRoutesParams(value: unknown): { origin: string; destination: string } | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.origin !== "string" || !p.origin.trim()) return null;
  if (typeof p.destination !== "string" || !p.destination.trim()) return null;
  return { origin: p.origin, destination: p.destination };
}

function validateExternalEvidenceNeed(value: unknown): ConversationUnderstanding["externalEvidenceNeed"] {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const capability = String(item.capability);
  if (!VALID_EXTERNAL_EVIDENCE_CAPABILITIES.includes(capability)) return null;
  if (typeof item.query !== "string" || !item.query.trim()) return null;

  // Each structured capability requires its own valid param bag — a
  // capability without usable structured params can't reach its tool, so
  // it must fail closed here rather than silently falling through with
  // nothing for the tool to act on.
  if (capability === "CURRENCY") {
    const currency = validateCurrencyParams(item.currency);
    if (!currency) return null;
    return { capability: "CURRENCY", query: item.query, currency };
  }
  if (capability === "WEATHER") {
    const weather = validateWeatherParams(item.weather);
    if (!weather) return null;
    return { capability: "WEATHER", query: item.query, weather };
  }
  if (capability === "PLACES") {
    const places = validatePlacesParams(item.places);
    if (!places) return null;
    return { capability: "PLACES", query: item.query, places };
  }
  if (capability === "ROUTES") {
    const routes = validateRoutesParams(item.routes);
    if (!routes) return null;
    return { capability: "ROUTES", query: item.query, routes };
  }
  return { capability: item.capability, query: item.query } as ConversationUnderstanding["externalEvidenceNeed"];
}

function validateArtifactRequest(value: unknown): ConversationUnderstanding["artifactRequest"] {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.format !== "XLSX") return null;
  if (!ARTIFACT_DATASET_INTENTS.includes(item.dataset as never)) return null;
  if (!ARTIFACT_PERIOD_INTENTS.includes(item.period as never)) return null;
  return { format: "XLSX", dataset: item.dataset, period: item.period } as ConversationUnderstanding["artifactRequest"];
}

function isValidCalendarDateRequest(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.kind === "today" || item.kind === "tomorrow") return true;
  if (item.kind === "explicit") {
    return typeof item.day === "number" && item.day >= 1 && item.day <= 31
      && typeof item.month === "number" && item.month >= 1 && item.month <= 12;
  }
  return false;
}

export async function classifyConversation(
  input: ConversationUnderstandingInput,
): Promise<ConversationUnderstanding> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return SAFE_FALLBACK;

    // Classification gates the entire turn (fast-path miss forces every
    // business-keyword message through this single call), unlike the 45s
    // used for the primary generation call elsewhere — a stuck classify
    // call has been observed taking ~20s and, with the 45s+1 retry this
    // used to share, could leave a user waiting up to ~90s before
    // SAFE_FALLBACK below ever kicks in. A tighter ceiling gets a slow or
    // wedged provider call to that same safe, deterministic fallback fast.
    const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 1 });

    const userContent = input.recentMessages?.length
      ? `Önceki mesajlar:\n${input.recentMessages.join("\n")}\n\nSon mesaj:\n${input.message}`
      : input.message;

    const tOpenAI = performance.now();
    const response = await client.responses.create({
      model: CONVERSATION_UNDERSTANDING_MODEL,
      instructions: CONVERSATION_UNDERSTANDING_SYSTEM_PROMPT,
      input: userContent,
      max_output_tokens: 500,
      temperature: 0,
      store: false,
    });
    logOpenAiTelemetry("conversation-understanding", response, Math.round(performance.now() - tOpenAI));

    const text = response.output_text?.trim();
    if (!text) return SAFE_FALLBACK;

    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return SAFE_FALLBACK;
    }

    return validateUnderstanding(parsed) ?? SAFE_FALLBACK;
  } catch {
    return SAFE_FALLBACK;
  }
}
