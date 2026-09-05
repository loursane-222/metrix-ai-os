/**
 * Single centralized model-selection boundary for METRIX's AI runtimes.
 *
 * Grand Consolidation Operation, section 23: model name must not be
 * scattered across routes/domain files, and a model swap must never require
 * an architecture change — only an env var. Two tiers exist because they are
 * genuinely different jobs, not because of cost-routing logic hidden in
 * business code:
 *
 *  - EXECUTIVE_AGENT: the one METRIX Executive Agent's reasoning/tool-calling
 *    loop (src/lib/executive-agent). This is the Genel Müdür model.
 *  - DETERMINISTIC_EXTRACTION: cheap, non-judgment typed extraction
 *    (Conversation Understanding's navigation/date/format/confirmation
 *    fields, document classifiers, etc.) — never given management decision
 *    authority regardless of how capable the underlying model is.
 */

// Verified against the installed @openai/agents-openai / @openai/agents-core
// packages (node_modules/@openai/agents-openai/dist/defaults.js and
// .../agents-core/dist/defaultModel.js), not assumed from training data: the
// current model family is GPT-5.6, with three durable capability tiers —
// Sol (flagship reasoning), Terra (balanced), Luna (cheapest, and the SDK's
// own bare default). METRIX's Executive Agent does cross-domain judgment
// (risk/opportunity detection, priority, fact/inference/judgment
// separation) — that is exactly Sol's tier, not the SDK's cost-optimized
// default, so it is named explicitly here rather than left implicit.
export const METRIX_EXECUTIVE_MODEL =
  process.env.METRIX_EXECUTIVE_MODEL?.trim() || "gpt-5.6-sol";

// The SDK's own default reasoning effort for every gpt-5.6 tier is "none"
// (see defaultModel.js's DEFAULT_REASONING_EFFORT_PATTERNS) — appropriate for
// quick chat use, not for a General Manager weighing evidence across
// domains. Executive Agent runs opt into real reasoning effort explicitly;
// still overridable centrally, never per-callsite.
export const METRIX_EXECUTIVE_REASONING_EFFORT =
  (process.env.METRIX_EXECUTIVE_REASONING_EFFORT?.trim() as
    | "low"
    | "medium"
    | "high"
    | undefined) || "medium";

export const METRIX_DETERMINISTIC_EXTRACTION_MODEL =
  process.env.METRIX_EXTRACTION_MODEL?.trim() || "gpt-4.1-mini";

export const EXECUTIVE_AGENT_MAX_TURNS = Number(
  process.env.METRIX_EXECUTIVE_MAX_TURNS ?? 12,
);

// Must stay safely below route.ts's maxDuration (300s, Vercel Hobby +
// Fluid Compute ceiling — see src/app/api/ai/chat/route.ts) so a genuinely
// slow run gets this abort's honest "taking too long" handling instead of
// being hard-killed by the platform with no response at all. 270s leaves
// 30s of margin for response finalization/persistence after the abort.
export const EXECUTIVE_AGENT_RUN_TIMEOUT_MS = Number(
  process.env.METRIX_EXECUTIVE_RUN_TIMEOUT_MS ?? 270_000,
);

export const EXECUTIVE_AGENT_TOOL_TIMEOUT_MS = Number(
  process.env.METRIX_EXECUTIVE_TOOL_TIMEOUT_MS ?? 20_000,
);
