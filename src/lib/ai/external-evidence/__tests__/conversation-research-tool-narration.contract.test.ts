import { describe, expect, it } from "vitest";
import { buildExternalEvidencePromptLine } from "../conversation-research-tool";
import type { ExternalEvidenceResult } from "../external-evidence.types";
import type { ExternalEvidenceNeedRequest } from "@/lib/conversation-understanding";

// Regression suite for "External World + Conversation Presentation" polish:
//
// Problem 1 — buildExternalEvidencePromptLine used to instruct METRIX to
// "make clear it is sourced from the web (not company records)" on every
// single external-evidence answer, mechanically producing "Bu bilgi dış
// kaynaklardan alınmıştır."-style boilerplate. Provenance itself (the
// `sources` list, `result.provenance`) must stay present internally; only
// the MANDATORY narration instruction is removed, replaced with a
// materially-relevant condition.
//
// Problem 2 — the same function never surfaced `result.observedAt` (the
// evidence's own date, distinct from `retrievedAt`), so a same-day fetch of
// a slightly older FX reference rate got narrated as "bugünün kuru" (today's
// rate). Fixed by reusing the observedAt the shared evidence contract
// already carries (currency, weather) — no capability-specific hardcoding.

function successResult(overrides: Partial<Extract<ExternalEvidenceResult, { status: "SUCCESS" }>> = {}): ExternalEvidenceResult {
  return {
    status: "SUCCESS",
    capability: "web_research",
    query: "test query",
    retrievedAt: "2026-09-01T08:00:00.000Z",
    provenance: [{ providerId: "test_provider", sourceName: "Example Source", sourceUrl: "https://example.com" }],
    payload: { summary: "test payload" },
    ...overrides,
  };
}

describe("buildExternalEvidencePromptLine — provenance narration is conditional, not mechanical (Problem 1)", () => {
  it("1. ordinary CURRENCY response does not mandate mechanical external-source narration", () => {
    const need: ExternalEvidenceNeedRequest = { capability: "CURRENCY", query: "1 USD kaç TRY", recency: "any" };
    const line = buildExternalEvidencePromptLine(need, successResult());
    expect(line).not.toContain("make clear it is sourced from the web");
    expect(line).toContain("you do not need to mechanically state");
  });

  it("2. ordinary WEATHER response does not mandate it", () => {
    const need: ExternalEvidenceNeedRequest = { capability: "WEATHER", query: "yarın Ankara hava", recency: "any" };
    const line = buildExternalEvidencePromptLine(need, successResult());
    expect(line).not.toContain("make clear it is sourced from the web");
    expect(line).toContain("only narrate where the information came from when it is genuinely material");
  });

  it("3. ordinary PLACES response does not mandate it", () => {
    const need: ExternalEvidenceNeedRequest = { capability: "PLACES", query: "italian restaurant Çankaya", recency: "any" };
    const line = buildExternalEvidencePromptLine(need, successResult());
    expect(line).not.toContain("make clear it is sourced from the web");
  });

  it("4. ordinary CURRENT_NEWS response does not mandate it", () => {
    const need: ExternalEvidenceNeedRequest = { capability: "CURRENT_NEWS", query: "OpenAI gelişmeleri", recency: "any" };
    const line = buildExternalEvidencePromptLine(need, successResult());
    expect(line).not.toContain("make clear it is sourced from the web");
  });

  it("5. provenance metadata remains present internally — the sources list is still built into the line", () => {
    const need: ExternalEvidenceNeedRequest = { capability: "CURRENCY", query: "1 USD kaç TRY", recency: "any" };
    const line = buildExternalEvidencePromptLine(need, successResult());
    expect(line).toContain("Sources: Example Source");
    expect(line).toContain("retrieved 2026-09-01T08:00:00.000Z");
  });

  it("6. an explicit source question is still one of the materially-relevant reasons to narrate provenance", () => {
    const need: ExternalEvidenceNeedRequest = { capability: "CURRENCY", query: "1 USD kaç TRY", recency: "any" };
    const line = buildExternalEvidencePromptLine(need, successResult());
    expect(line).toContain("the user directly asks where this came from");
  });

  it("7. internal-vs-external truth distinction remains available and internal truth wins on conflict", () => {
    const need: ExternalEvidenceNeedRequest = { capability: "CURRENCY", query: "1 USD kaç TRY", recency: "any" };
    const line = buildExternalEvidencePromptLine(need, successResult());
    expect(line).toContain("NOT internal company data");
    expect(line).toContain("internal company truth wins");
  });
});

describe("buildExternalEvidencePromptLine — temporal precision: observedAt vs retrievedAt (Problem 2)", () => {
  const need: ExternalEvidenceNeedRequest = { capability: "CURRENCY", query: "1 USD kaç TRY", recency: "any" };

  it("8. retrievedAt today + observedAt yesterday cannot be narrated as evidence from 'today' unconditionally", () => {
    const result = successResult({
      capability: "currency",
      retrievedAt: "2026-09-01T08:00:00.000Z",
      observedAt: "2026-08-31",
      payload: { base: "USD", quote: "TRY", rate: 48.26, amount: 1, convertedAmount: 48.26, asOfDate: "2026-08-31" },
    });
    const line = buildExternalEvidencePromptLine(need, result);
    expect(line).toContain("Only call this \"today's\"/\"the current\" value if 2026-08-31 genuinely is today's date");
    expect(line).toContain("distinct from \"retrieved 2026-09-01T08:00:00.000Z\"");
  });

  it("9. the latest available FX reference dated yesterday remains usable — the evidence is still passed through, not discarded", () => {
    const result = successResult({
      capability: "currency",
      observedAt: "2026-08-31",
      payload: { base: "USD", quote: "TRY", rate: 48.26, amount: 1, convertedAmount: 48.26, asOfDate: "2026-08-31" },
    });
    const line = buildExternalEvidencePromptLine(need, result);
    expect(line).toContain("48.26");
    expect(line).not.toContain("cannot be used");
    expect(line).not.toContain("discard");
  });

  it("11. narration can identify it as the latest/reference rate without claiming it was observed today", () => {
    const result = successResult({
      capability: "currency",
      observedAt: "2026-08-31",
      payload: { base: "USD", quote: "TRY", rate: 48.26, amount: 1, convertedAmount: 48.26, asOfDate: "2026-08-31" },
    });
    const line = buildExternalEvidencePromptLine(need, result);
    expect(line).toContain("latest available reference");
    expect(line).toContain("2026-08-31 tarihli son referans kura göre");
  });

  it("12. genuinely same-day evidence is still allowed to be described as current/today when it truly is today's date", () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const result = successResult({
      capability: "currency",
      observedAt: todayIso,
      payload: { base: "USD", quote: "TRY", rate: 48.3, amount: 1, convertedAmount: 48.3, asOfDate: todayIso },
    });
    const line = buildExternalEvidencePromptLine(need, result);
    // The instruction conditions on genuine same-day observation rather than
    // banning "today" framing outright — it never tells METRIX same-day
    // evidence must be described as stale.
    expect(line).not.toContain("never call this today's");
    expect(line).toContain(`if ${todayIso} genuinely is today's date`);
  });

  it("does not add an observedAt note for capabilities without one (e.g. places/routes point-in-time evidence)", () => {
    const result = successResult({ capability: "places", observedAt: undefined });
    const line = buildExternalEvidencePromptLine({ capability: "PLACES", query: "italian restaurant", recency: "any" }, result);
    expect(line).not.toContain("This evidence's own date is");
  });
});

describe("13. Phase B freshness behavior (commit 681dee4) remains intact alongside the new observedAt note", () => {
  it("still carries the recency-specific freshness guardrail for explicit recency requests", () => {
    const need: ExternalEvidenceNeedRequest = { capability: "CURRENT_NEWS", query: "OpenAI en son gelişme", recency: "latest" };
    const result = successResult({ payload: { summary: "28 Ağustos 2026 tarihli gelişme." } });
    const line = buildExternalEvidencePromptLine(need, result);
    expect(line).toContain("never relabel an older result as current");
    expect(line).toContain("the latest/most current");
  });

  it("adds no freshness guardrail for ordinary topical research (recency 'any')", () => {
    const need: ExternalEvidenceNeedRequest = { capability: "COMPANY_RESEARCH", query: "OpenAI profili", recency: "any" };
    const line = buildExternalEvidencePromptLine(need, successResult());
    expect(line).not.toContain("never relabel an older result as current");
  });
});
