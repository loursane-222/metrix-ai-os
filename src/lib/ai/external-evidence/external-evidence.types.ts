// Canonical evidence contract for external-world tools (web/search, news,
// company research, places, routes, weather, FX, and future providers of
// the same shape). This is the ONLY thing a tool is allowed to hand back to
// canonical reasoning — structured evidence, never prose. There is
// deliberately no free-text "message"/"narration" field anywhere in this
// file: a tool cannot become a second speaker because the type it returns
// has nowhere to carry a user-facing sentence. METRIX (the canonical
// conversation/response authority already established by the Character
// Reality boundary) is the only thing that turns this evidence into words.
//
// Kept intentionally small: one contract works for every capability family
// (web/search, news, research, places, routes, weather, FX) because they
// all reduce to the same shape — a capability id, a query, provenance,
// a retrieval timestamp, and either a structured payload or a structured
// failure. Do not add per-provider fields here; a provider's own payload
// shape lives in its adapter, typed as this contract's `payload` generic.

// Extend this list as real adapters are added. Deliberately not a bare
// `string` — every capability that can produce evidence must be named here
// once, the same convention CONVERSATION_EXTENSION_DOMAINS already uses for
// the internal business-tool boundary (see
// conversation-extensions/conversation-extension-handoff.ts).
export const EXTERNAL_EVIDENCE_CAPABILITIES = ["web_research", "currency", "weather", "places", "routes"] as const;
export type ExternalEvidenceCapability = (typeof EXTERNAL_EVIDENCE_CAPABILITIES)[number];

// Where a piece of evidence came from. Preserved end-to-end so canonical
// reasoning (and, if it chooses to, the final narration) can distinguish
// "I know this from company records" from "I found this externally" —
// required by the Evidence Contract (Phase A, section 5).
export type ExternalEvidenceProvenance = Readonly<{
  providerId: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
}>;

export type ExternalEvidenceFailureReason =
  | "timeout"
  | "rate_limit"
  | "unavailable"
  | "invalid_response"
  | "no_results"
  | "provider_error"
  | "not_configured";

export type ExternalEvidenceRequest = Readonly<{
  capability: ExternalEvidenceCapability;
  query: string;
}>;

export type ExternalEvidenceResult<TPayload = unknown> =
  | Readonly<{
      status: "SUCCESS";
      capability: ExternalEvidenceCapability;
      query: string;
      // When this evidence was fetched — always present, always trustworthy
      // for freshness checks regardless of what a provider does or doesn't
      // report about the underlying fact's own age.
      retrievedAt: string;
      // When the underlying fact itself was observed/published, if the
      // provider can say — distinct from retrievedAt (a page fetched today
      // can report something published last week). Optional because not
      // every capability can know this.
      observedAt?: string | null;
      provenance: readonly ExternalEvidenceProvenance[];
      payload: TPayload;
    }>
  | Readonly<{
      status: "FAILED";
      capability: ExternalEvidenceCapability;
      query: string;
      retrievedAt: string;
      failureReason: ExternalEvidenceFailureReason;
    }>;

// A tool is purely an evidence source: capability identity in, structured
// evidence out. No tool implementation may add a field here that could
// carry user-facing text — that is what keeps a tool from ever becoming a
// second personality (Phase A, section 11). A tool must never throw past
// its own boundary; every real failure (timeout, network error, malformed
// response) is the adapter's job to normalize into a FAILED result so a
// raw provider/system message can never reach the orchestrator, let alone
// the user.
export type ExternalEvidenceTool = Readonly<{
  capability: ExternalEvidenceCapability;
  fetch(query: string): Promise<ExternalEvidenceResult>;
}>;
