export type ConversationKind =
  | "general_chat"
  | "company_related"
  | "mixed"
  | "unclear";

export type UserMotivation =
  | "bilgi_almak"
  | "sohbet_etmek"
  | "karar_destegi"
  | "kayit_islem"
  | "planlama"
  | "belirsiz";

export type CompanyRelevance = "none" | "low" | "medium" | "high";

export type ActionExpectation = "none" | "possible" | "explicit";

export type ConfidenceLevel = "low" | "medium" | "high";

export type SuggestedHandling =
  | "answer_only"
  | "ask_clarification"
  | "executive_reasoning"
  | "passive_note";

export type ConversationUnderstandingReasoning = {
  summary: string;
  observations: string[];
  uncertainty: string[];
  whyThisHandling: string;
};

// Calendar-only navigation refinement. The model extracts an intent keyword
// or explicit day/month numbers — it never computes "today"/"tomorrow" as an
// absolute date itself (that would be fabrication risk: the model has no
// reliable notion of the real current date). Absolute date resolution always
// happens deterministically downstream, from the server's real clock, in
// business-navigation.ts.
export type CalendarViewRequest = "day" | "week" | "month";
export type CalendarDateRequest =
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "explicit"; day: number; month: number };

export type BusinessNavigationRequest = Readonly<{
  operation: "NAVIGATE";
  domain: "company" | "customer" | "offer" | "product" | "task" | "calendar" | "accounting" | "team" | "report" | "document" | "kpi" | "stock" | "order" | "invoice" | "payment" | "supplier" | "performance";
  target: "root" | "list" | "detail" | "edit" | "create";
  entityReference: string | null;
  calendarView?: CalendarViewRequest | null;
  calendarDate?: CalendarDateRequest | null;
}>;

// Phase B — external evidence recognition. Distinct from businessNavigation
// on purpose: this never opens a workspace surface or touches canonical
// company data, it only signals that answering correctly needs current
// evidence from outside METRIX (Phase A's external-evidence authority).
// "web_research" is the only real Phase A tool capability today (Phase A,
// external-evidence.types.ts) — these three semantic intents all route to
// it with a differently-composed query; they exist so the query the model
// writes is shaped correctly for what the user actually needs (a URL vs. a
// news summary vs. a company profile), not because there are three
// providers.
export type ExternalEvidenceCapabilityIntent =
  | "WEB_SEARCH" | "CURRENT_NEWS" | "COMPANY_RESEARCH"
  | "CURRENCY" | "WEATHER" | "PLACES" | "ROUTES";

// Phase C — structured evidence families. Each capability that needs more
// than a free-text query gets its own small parameter shape (Phase C,
// section 4: capability-specific payload types, not one giant schema).
// `query` on ExternalEvidenceNeedRequest stays the always-present
// human-readable summary; these are additive, optional structured params
// read only by the matching capability's tool.
export type CurrencyEvidenceParams = Readonly<{
  amount: number;
  // ISO 4217 codes (e.g. "USD", "EUR", "TRY") — the model normalizes
  // currency names/symbols into these; when only one currency is named
  // (e.g. "Euro bugün kaç?"), quote defaults to "TRY".
  base: string;
  quote: string;
}>;

export type WeatherEvidenceParams = Readonly<{
  location: string;
  when: "today" | "tomorrow";
}>;

export type PlacesEvidenceParams = Readonly<{
  // What is being searched for (e.g. "İtalyan restoranı").
  query: string;
  // Where to search near (a place/neighborhood/city name), or null if the
  // message doesn't anchor a location.
  near: string | null;
}>;

export type RoutesEvidenceParams = Readonly<{
  origin: string;
  destination: string;
}>;

// How strongly the user's own temporal language constrains the research
// this need should return. "any" (or omitted) is the default for ordinary
// topical questions ("OpenAI hakkında bilgi ver", "GPT-5.6 nedir?") — no
// forced recency. The other three are only set when the user's message
// itself expresses that language ("bugün" → today, "bu hafta" → this_week,
// "en son"/"son gelişme"/"güncel"/"latest"/"current" → latest) — this is
// read off the same single classification call, never a second LLM call.
export const EXTERNAL_EVIDENCE_RECENCY = ["today", "this_week", "latest", "any"] as const;
export type ExternalEvidenceRecency = (typeof EXTERNAL_EVIDENCE_RECENCY)[number];

export type ExternalEvidenceNeedRequest = Readonly<{
  capability: ExternalEvidenceCapabilityIntent;
  // The concrete external research query to run — composed by the model
  // from the user's message, never a verbatim copy of internal instructions.
  // Always present, even for structured capabilities (used as a
  // human-readable summary/log label).
  query: string;
  // Null/omitted means no explicit temporal constraint in the user's
  // message — the research tool and final synthesis must not invent one.
  recency?: ExternalEvidenceRecency | null;
  currency?: CurrencyEvidenceParams | null;
  weather?: WeatherEvidenceParams | null;
  places?: PlacesEvidenceParams | null;
  routes?: RoutesEvidenceParams | null;
}>;

export type ConversationUnderstanding = {
  conversationKind: ConversationKind;
  userMotivation: UserMotivation;
  companyRelevance: CompanyRelevance;
  actionExpectation: ActionExpectation;
  confidence: ConfidenceLevel;
  shouldAskClarification: boolean;
  clarificationQuestion?: string;
  shouldInvokeExecutiveBrain: boolean;
  suggestedHandling: SuggestedHandling;
  businessNavigation?: BusinessNavigationRequest | null;
  // User asked to close the currently open Living Workspace surface and
  // return to full-screen chat (e.g. "teklif sayfasını kapat, sohbete dön").
  // Domain-agnostic on purpose: it closes whatever surface is open, it does
  // not open one — that's businessNavigation's job.
  workspaceControl?: "close" | null;
  externalEvidenceNeed?: ExternalEvidenceNeedRequest | null;
  artifactRequest?: ArtifactRequest | null;
  reasoning: ConversationUnderstandingReasoning;
};

// Phase D1 — Work Tool intent. Kept minimal and internal-truth-only: an
// artifact request is a canonical company-data question plus an
// output-format instruction, never a reason to reach for external evidence
// (that's externalEvidenceNeed's job, and the two are mutually exclusive —
// see the prompt's field guidance). `dataset` and `period` are each closed
// unions with exactly the one real value D1 supports, deliberately not
// free-text, so route.ts never has to guess what the model meant; extend
// these unions (not this shape) when a future dataset/period is added.
export const ARTIFACT_DATASET_INTENTS = ["collections"] as const;
export type ArtifactDatasetIntent = (typeof ARTIFACT_DATASET_INTENTS)[number];

export const ARTIFACT_PERIOD_INTENTS = ["last_month"] as const;
export type ArtifactPeriodIntent = (typeof ARTIFACT_PERIOD_INTENTS)[number];

// Phase D2 — added DOCX/PDF alongside XLSX. Still a closed union, not
// free-text, and still the same single classification call; no second
// artifact/format classifier was introduced.
export const ARTIFACT_FORMAT_INTENTS = ["XLSX", "DOCX", "PDF"] as const;
export type ArtifactFormatIntent = (typeof ARTIFACT_FORMAT_INTENTS)[number];

export type ArtifactRequest = Readonly<{
  format: ArtifactFormatIntent;
  dataset: ArtifactDatasetIntent;
  period: ArtifactPeriodIntent;
}>;

export type ConversationUnderstandingInput = {
  message: string;
  recentMessages?: string[];
};
