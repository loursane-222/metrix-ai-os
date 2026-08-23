import { describe, expect, it, vi } from "vitest";

// See action-catalog.test.ts — the entity-resolvers.ts import chain touches
// prisma.ts (every domain's list() service); stub it before anything else
// imports it. ENTITY_REFERENCE_FIELDS is re-exported for real (pure data,
// no DB), only resolveEntityReference itself is replaced with a mock.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

const resolveEntityReference = vi.fn();
vi.mock("../entity-resolvers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../entity-resolvers")>();
  return { ...actual, resolveEntityReference: (...args: unknown[]) => resolveEntityReference(...args) };
});

const { resolveGeneralOrchestrationPlan } = await import("../general-plan-resolver");

const auth = { organization: { id: "org1" }, user: { id: "user1" } } as never;

describe("resolveGeneralOrchestrationPlan", () => {
  it("returns NOT_HANDLED when the model classifies the utterance as unsupported", async () => {
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "unsupported" }));
    const outcome = await resolveGeneralOrchestrationPlan({ utterance: "bugün hava nasıl", auth, generateText });
    expect(outcome.status).toBe("NOT_HANDLED");
  });

  it("returns CLARIFICATION_REQUIRED when the model asks for one", async () => {
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "clarification_required" }));
    const outcome = await resolveGeneralOrchestrationPlan({ utterance: "sipariş oluştur", auth, generateText });
    expect(outcome.status).toBe("CLARIFICATION_REQUIRED");
  });

  it("returns CLARIFICATION_REQUIRED when the model names an action outside the catalog", async () => {
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "plan", steps: [{ action: "not.a.real.action", args: {} }] }));
    const outcome = await resolveGeneralOrchestrationPlan({ utterance: "bilinmeyen bir şey yap", auth, generateText });
    expect(outcome.status).toBe("CLARIFICATION_REQUIRED");
  });

  it("returns CLARIFICATION_REQUIRED when an entity reference cannot be resolved", async () => {
    resolveEntityReference.mockResolvedValue({ status: "NOT_FOUND" });
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({
      result: "plan",
      steps: [{ action: "quote.create", args: { customerId: "Bilinmeyen Firma", title: "Teklif", amount: 1000 } }],
    }));
    const outcome = await resolveGeneralOrchestrationPlan({ utterance: "Bilinmeyen Firma için teklif hazırla", auth, generateText });
    expect(outcome.status).toBe("CLARIFICATION_REQUIRED");
  });

  it("builds a real plan with the entity reference resolved to an id", async () => {
    resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "c1", label: "Atlas İnşaat" });
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({
      result: "plan",
      steps: [{ action: "quote.create", args: { customerId: "Atlas", title: "Teklif", amount: 50000, currency: "TRY" } }],
    }));
    const outcome = await resolveGeneralOrchestrationPlan({ utterance: "Atlas için 50000 TL teklif hazırla", auth, generateText });
    if (outcome.status !== "PLAN_READY") throw new Error("expected PLAN_READY");
    expect(outcome.plan.steps).toHaveLength(1);
    expect(outcome.plan.steps[0]!.actionName).toBe("quote.create");
    expect(outcome.plan.steps[0]!.argsTemplate).toMatchObject({
      customerId: "c1",
      title: "Teklif",
      amount: 50000,
      currency: "TRY",
    });
  });

  it("defers a $stepN entity reference to the prior step's real result at execution time", async () => {
    resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "c1", label: "Atlas İnşaat" });
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({
      result: "plan",
      steps: [
        { action: "order.create", args: { customerId: "Atlas" } },
        { action: "delivery.create", args: { sourceOrderId: "$step1", customerId: "$step1" } },
      ],
    }));
    const outcome = await resolveGeneralOrchestrationPlan({ utterance: "Atlas için sipariş oluştur, sonra irsaliyesini kes", auth, generateText });
    if (outcome.status !== "PLAN_READY") throw new Error("expected PLAN_READY");
    expect(outcome.plan.steps).toHaveLength(2);
    expect(outcome.plan.steps[1]!.argsTemplate.sourceOrderId).toEqual({ $stepRef: 0 });
  });

  it("accepts an approval-gated action (quote.dispatch) into the plan — it just won't run autonomously", async () => {
    resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "q1", label: "Atlas Teklifi" });
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({
      result: "plan",
      steps: [{ action: "quote.dispatch", args: { quoteId: "Atlas Teklifi" } }],
    }));
    const outcome = await resolveGeneralOrchestrationPlan({ utterance: "Atlas teklifini gönder", auth, generateText });
    if (outcome.status !== "PLAN_READY") throw new Error("expected PLAN_READY");
    expect(outcome.plan.steps[0]!.actionName).toBe("quote.dispatch");
    expect(outcome.plan.steps[0]!.argsTemplate).toMatchObject({ quoteId: "q1" });
  });
});
