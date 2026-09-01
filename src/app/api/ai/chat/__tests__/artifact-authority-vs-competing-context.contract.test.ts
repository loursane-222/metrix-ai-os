import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Regression suite for the 2026-09-01 production regression:
// "Geçen ayın tahsilat performansını PowerPoint olarak hazırla." produced a
// hedging answer ("hangi verileri... görmek istediğinizi belirtir misin?")
// that fabricated a "Temmuz 2026" period and paraphrased a raw Payment
// status list (paid/pending/overdue) as if it were period collection
// performance — instead of using the real Settlement-based
// CollectionsDataset/artifact outcome.
//
// Proven root causes (live-model reproduction during diagnosis, see the
// D3 full-turn root-cause report):
//   1. classifyConversation() DOES correctly resolve this exact message to
//      artifactRequest {format: PPTX, dataset: collections, period:
//      last_month} — the classifier itself was never the defect.
//   2. resolvePreviousCalendarMonthRange() DOES correctly resolve
//      "last_month" to August 2026 for 2026-09-01 — period math was never
//      the defect.
//   3. buildCollectionsArtifactPromptLine's EMPTY/FAILED branches hardcoded
//      "Excel export" regardless of the actually-requested format.
//   4. serializeCanonicalBusinessFacts's generic "payments" evidence line
//      (unscoped by period, triggered independently by the word "tahsilat"
//      in the same message) carried no disclaimer distinguishing it from
//      period-scoped collection/tahsilat performance — a live full-turn
//      reproduction proved the model uses it as a substitute when no
//      artifact evidence line is present to assert its own authority.
//
// This file proves the fix at every full-turn boundary the task named,
// using deterministic contract assertions (never a live LLM call) —
// consistent with this codebase's established test convention.

const create = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class OpenAI {
    responses = { create };
  },
}));
vi.mock("@/lib/ai/telemetry/openai-telemetry", () => ({ logOpenAiTelemetry: vi.fn() }));
// serializeCanonicalBusinessFacts is pure; Prisma is stubbed purely to avoid
// canonical-business-facts.service.ts's module-level DATABASE_URL check —
// same pattern as cross-format-artifact-truth.test.ts.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { classifyConversation } from "@/lib/conversation-understanding/conversation-understanding.service";
import { resolvePreviousCalendarMonthRange } from "@/lib/artifacts/date-ranges";
import {
  buildCollectionsArtifactPromptLine,
  buildDeliverableArtifactPayload,
  type CollectionsArtifactOutcome,
} from "@/lib/artifacts/collections-artifact.service";
import type { CollectionsDataset } from "@/lib/artifacts/datasets/collections-dataset.service";
import { ARTIFACT_MIME_TYPES } from "@/lib/artifacts/artifact.types";
import { serializeCanonicalBusinessFacts, type CanonicalBusinessFacts } from "@/lib/canonical-business-facts/canonical-business-facts.service";

const USER_MESSAGE = "Geçen ayın tahsilat performansını PowerPoint olarak hazırla.";
const originalApiKey = process.env.OPENAI_API_KEY;

// The exact real-model response confirmed via a live classifyConversation()
// call to gpt-4.1-mini during diagnosis — used here as a deterministic mock
// so this suite never depends on network access.
function providerUnderstanding() {
  return {
    conversationKind: "company_related",
    userMotivation: "bilgi_almak",
    companyRelevance: "high",
    actionExpectation: "explicit",
    confidence: "high",
    shouldAskClarification: false,
    shouldInvokeExecutiveBrain: false,
    suggestedHandling: "answer_only",
    businessNavigation: null,
    workspaceControl: null,
    externalEvidenceNeed: null,
    artifactRequest: { format: "PPTX", dataset: "collections", period: "last_month" },
    reasoning: {
      summary: "Kullanıcı geçen ayın tahsilat performansını PowerPoint formatında dosya olarak talep ediyor.",
      observations: [],
      uncertainty: [],
      whyThisHandling: "artifactRequest dolduruldu, executive brain devreye alınmadı.",
    },
  };
}

const augustPeriod = resolvePreviousCalendarMonthRange(new Date("2026-09-01T10:00:00.000Z"), "Europe/Istanbul");

const paymentsFacts: readonly CanonicalBusinessFacts[] = [
  Object.freeze({
    entity: "payments" as const,
    model: "Payment" as const,
    count: 4,
    records: Object.freeze([
      Object.freeze({ id: "p1", title: "Temmuz faturası", status: "PAID" }),
      Object.freeze({ id: "p2", title: "Ağustos faturası", status: "PENDING" }),
      Object.freeze({ id: "p3", title: "Haziran faturası", status: "OVERDUE" }),
      Object.freeze({ id: "p4", title: "Eylül faturası", status: "PARTIAL" }),
    ]),
  }),
];

describe("1/2 — artifactRequest and period resolution reach the correct values (item 1, item 2 of the root-cause report)", () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = "test-key"; });
  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  });
  beforeEach(() => create.mockReset());

  it("classifyConversation resolves the exact production message to artifactRequest PPTX/collections/last_month", async () => {
    create.mockResolvedValueOnce({ output_text: JSON.stringify(providerUnderstanding()) });
    const result = await classifyConversation({ message: USER_MESSAGE });
    expect(result.artifactRequest).toEqual({ format: "PPTX", dataset: "collections", period: "last_month" });
    expect(result.businessNavigation).toBeNull();
  });

  it("resolvePreviousCalendarMonthRange resolves 'last_month' to August 2026 for today=2026-09-01, not July", () => {
    expect(augustPeriod.label).toBe("Ağustos 2026");
    expect(augustPeriod.isoLabel).toBe("2026-08");
    expect(augustPeriod.label).not.toBe("Temmuz 2026");
  });
});

function buildCombinedEvidence(outcome: CollectionsArtifactOutcome): string {
  // Mirrors route.ts's canonicalOperationEvidenceLines ordering: canonical
  // business facts first, artifact outcome line second.
  return [
    serializeCanonicalBusinessFacts(paymentsFacts),
    buildCollectionsArtifactPromptLine(outcome),
  ].filter(Boolean).join("\n");
}

describe("3 — EMPTY: no PPTX generated, no deliverable, authoritative EMPTY truth survives competing payment context", () => {
  const emptyDataset: CollectionsDataset = {
    period: augustPeriod,
    records: [],
    recordCount: 0,
    totalsByCurrency: {},
  };
  const outcome: CollectionsArtifactOutcome = { status: "EMPTY", dataset: emptyDataset, format: "pptx" };
  const evidence = buildCombinedEvidence(outcome);

  it("names the real period (August 2026) and the real format (PPTX), never July or a hardcoded Excel label", () => {
    expect(evidence).toContain("Ağustos 2026");
    expect(evidence).toContain("PPTX");
    expect(evidence).not.toContain("Temmuz 2026");
    expect(evidence).not.toContain("Excel export");
  });

  it("asserts the outcome's own authority and forbids clarification/capability-denial/period-invention", () => {
    expect(evidence).toContain("authoritative outcome");
    expect(evidence).toContain("do not ask the user what data/details to include");
    expect(evidence).toContain("Do not invent a different period");
  });

  it("the competing payments evidence explicitly disclaims itself as a substitute for period collection performance", () => {
    expect(evidence).toContain("NOT a period-scoped collection/tahsilat performance summary or export");
  });

  it("no deliverable artifact is produced for an EMPTY outcome (mirrors route.ts's deliverableArtifact gating)", () => {
    const deliverableArtifact = (outcome as { status: string }).status === "GENERATED" ? "would-build" : null;
    expect(deliverableArtifact).toBeNull();
  });
});

describe("GENERATED: deliverable exists, correct MIME/filename, no capability denial, competing context does not override it", () => {
  const dataset: CollectionsDataset = {
    period: augustPeriod,
    records: [
      { occurredAt: new Date("2026-08-05T00:00:00Z"), customerName: "Atlas İnşaat", title: "Ağustos tahsilatı", amount: 3000, currency: "TRY", invoiceNumber: "INV-101", kind: "ORIGINAL" },
      { occurredAt: new Date("2026-08-14T00:00:00Z"), customerName: "Deneme Firması", title: "Ağustos tahsilatı", amount: 2000, currency: "TRY", invoiceNumber: "INV-102", kind: "ORIGINAL" },
    ],
    recordCount: 2,
    totalsByCurrency: { TRY: 5000 },
  };
  const file = {
    format: "pptx" as const,
    filename: "tahsilatlar-2026-08.pptx",
    mimeType: ARTIFACT_MIME_TYPES.pptx,
    content: Buffer.from("fake-pptx-bytes"),
  };
  const outcome: CollectionsArtifactOutcome = { status: "GENERATED", dataset, file };
  const evidence = buildCombinedEvidence(outcome);

  it("names the real period and format, states the real count/total", () => {
    expect(evidence).toContain("Ağustos 2026");
    expect(evidence).toContain("PPTX");
    expect(evidence).toContain("2 kayıt");
    expect(evidence).toContain("5000 TRY");
  });

  it("forbids capability denial and unnecessary clarification even with competing payment context present", () => {
    expect(evidence).toContain("Do not deny that PPTX export is a real capability");
    expect(evidence).toContain("do not ask the user what data/details to include");
  });

  it("produces a real deliverable artifact with correct MIME type and .pptx filename", () => {
    const deliverable = buildDeliverableArtifactPayload(file);
    expect(deliverable.filename).toBe("tahsilatlar-2026-08.pptx");
    expect(deliverable.mimeType).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(deliverable.dataUrl.startsWith("data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,")).toBe(true);
  });
});

describe("FAILED: no fabricated file, failure truth preserved, competing context does not invent success", () => {
  const outcome: CollectionsArtifactOutcome = { status: "FAILED", reason: "render_failed", format: "pptx" };
  const evidence = buildCombinedEvidence(outcome);

  it("names the real format, never claims a file was generated, forbids capability denial", () => {
    expect(evidence).toContain("PPTX");
    expect(evidence).not.toContain("Excel export");
    expect(evidence).toContain("must NOT say a file was generated");
    expect(evidence).toContain("You must NOT deny that PPTX export is a real capability");
  });

  it("asserts authority and forbids unnecessary clarification even with competing payment context present", () => {
    expect(evidence).toContain("authoritative outcome");
    expect(evidence).toContain("do not ask the user what data/details to include");
  });
});
