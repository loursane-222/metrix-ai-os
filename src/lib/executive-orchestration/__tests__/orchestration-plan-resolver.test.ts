import { describe, expect, it, vi } from "vitest";

const listCustomers = vi.fn();
vi.mock("@/lib/core/customers/customer.service", () => ({ listCustomers: (...args: unknown[]) => listCustomers(...args) }));

const { resolveOrchestrationPlan } = await import("../orchestration-plan-resolver");

const CUSTOMER = { id: "c1", displayName: "Atlas İnşaat", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: "1234567890" };
const auth = { organization: { id: "org1" }, user: { id: "user1" } } as never;

describe("resolveOrchestrationPlan", () => {
  it("returns NOT_HANDLED when the model classifies the utterance as unsupported", async () => {
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "unsupported" }));
    const outcome = await resolveOrchestrationPlan({ utterance: "bugün hava nasıl", auth, generateText });
    expect(outcome.status).toBe("NOT_HANDLED");
  });

  it("asks for clarification when amount is missing", async () => {
    listCustomers.mockResolvedValue([CUSTOMER]);
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "quote_and_followup_task", customerNameRaw: "Atlas", quoteTitle: "Teklif" }));
    const outcome = await resolveOrchestrationPlan({ utterance: "Atlas için teklif hazırla, 2 gün sonra aramam için görev aç", auth, generateText });
    expect(outcome.status).toBe("CLARIFICATION_REQUIRED");
  });

  it("asks for clarification when the customer cannot be resolved", async () => {
    listCustomers.mockResolvedValue([CUSTOMER]);
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "quote_and_followup_task", customerNameRaw: "Bilinmeyen Firma", quoteAmount: 50000 }));
    const outcome = await resolveOrchestrationPlan({ utterance: "Bilinmeyen Firma için 50000 TL teklif hazırla, 2 gün sonra aramam için görev aç", auth, generateText });
    expect(outcome.status).toBe("CLARIFICATION_REQUIRED");
  });

  it("builds a 2-step quote+task plan for a resolved customer", async () => {
    listCustomers.mockResolvedValue([CUSTOMER]);
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "quote_and_followup_task", customerNameRaw: "Atlas", quoteAmount: 50000, taskDueInDays: 3 }));
    const outcome = await resolveOrchestrationPlan({ utterance: "Atlas için 50000 TL teklif hazırla, 3 gün sonra aramam için görev aç", auth, generateText });
    if (outcome.status !== "PLAN_READY") throw new Error("expected PLAN_READY");
    expect(outcome.plan.steps).toHaveLength(2);
    expect(outcome.plan.steps[0]!.actionName).toBe("quote.create");
    expect(outcome.plan.steps[0]!.buildInput({ organizationId: "org1", actorUserId: "user1", priorResults: [] })).toMatchObject({ customerId: "c1", amount: 50000, currency: "TRY" });
    expect(outcome.plan.steps[1]!.actionName).toBe("task.create");
    const taskInput = outcome.plan.steps[1]!.buildInput({ organizationId: "org1", actorUserId: "user1", priorResults: [{ entityType: "quote", entityId: "q1" }] });
    expect(taskInput.description).toContain("q1");
  });
});
