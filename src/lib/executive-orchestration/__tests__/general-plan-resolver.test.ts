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
const { buildLastSuccessfulOperationContext } = await import("@/lib/conversations/last-operation-context");

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

  // Regression: quote.dispatch (a real, irreversible customer email send)
  // cannot be undone by any compensating action — the only way to guarantee
  // an orchestration failure never needs to compensate it is to never let a
  // plan put it anywhere but last. See plan-validation.ts.
  it("rejects a plan that places an irreversible action (quote.dispatch) before a later step", async () => {
    resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "q1", label: "Atlas Teklifi" });
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({
      result: "plan",
      steps: [
        { action: "quote.dispatch", args: { quoteId: "Atlas Teklifi" } },
        { action: "task.create", args: { title: "Takip et" } },
      ],
    }));
    const outcome = await resolveGeneralOrchestrationPlan({ utterance: "teklifi gönder, sonra takip görevi oluştur", auth, generateText });
    expect(outcome.status).toBe("PLAN_INVALID");
    if (outcome.status !== "PLAN_INVALID") throw new Error("expected PLAN_INVALID");
    expect(outcome.reason).toContain("quote.dispatch");
  });
});

describe("resolveGeneralOrchestrationPlan — cross-turn entity continuity (previousContext)", () => {
  function taskContext(taskId: string) {
    const handoff = {
      operation: "UPDATE", outcomeCode: "TASK_COMPLETED", resultStatus: "EXECUTED",
      entityResolution: "RESOLVED", entityDomain: "tasks", entityId: taskId, entityDisplayName: "Teklif takibi",
      candidateNames: [], fieldNames: [], mutationPerformed: true,
      navigationRequested: false, navigationStatus: "NOT_REQUESTED", approvalRequired: false,
    } as unknown as import("@/lib/conversation-extensions/conversation-extension-handoff").ConversationExtensionHandoff;
    return buildLastSuccessfulOperationContext(handoff, { sourceMessageId: "msg-1", organizationId: "org1" });
  }

  it("fills a missing required entity-reference field from the prior turn's canonical entity (no explicit reference in this utterance)", async () => {
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "plan", steps: [{ action: "task.complete", args: {} }] }));
    const outcome = await resolveGeneralOrchestrationPlan({
      utterance: "Onu da tamamla.", auth, generateText, previousContext: taskContext("task-1"),
    });
    if (outcome.status !== "PLAN_READY") throw new Error(`expected PLAN_READY, got ${outcome.status}`);
    expect(outcome.plan.steps[0]!.argsTemplate.taskId).toBe("task-1");
  });

  it("an explicit entity named in this utterance always overrides the prior continuity context", async () => {
    resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "task-2", label: "Farklı görev" });
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "plan", steps: [{ action: "task.complete", args: { taskId: "Farklı görev" } }] }));
    const outcome = await resolveGeneralOrchestrationPlan({
      utterance: "Farklı görevi tamamla.", auth, generateText, previousContext: taskContext("task-1"),
    });
    if (outcome.status !== "PLAN_READY") throw new Error(`expected PLAN_READY, got ${outcome.status}`);
    expect(outcome.plan.steps[0]!.argsTemplate.taskId).toBe("task-2");
  });

  it("a domain-incompatible prior context on a REQUIRED entity field asks for clarification rather than guessing", async () => {
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "plan", steps: [{ action: "task.complete", args: {} }] }));
    // previousContext is a quote, not a task — task.complete's required taskId cannot borrow it.
    const quoteHandoff = {
      operation: "CREATE", outcomeCode: "QUOTE_CREATED", resultStatus: "EXECUTED",
      entityResolution: "RESOLVED", entityDomain: "quotes", entityId: "quote-1", entityDisplayName: "Teklif",
      candidateNames: [], fieldNames: [], mutationPerformed: true,
      navigationRequested: false, navigationStatus: "NOT_REQUESTED", approvalRequired: false,
    } as unknown as import("@/lib/conversation-extensions/conversation-extension-handoff").ConversationExtensionHandoff;
    const previousContext = buildLastSuccessfulOperationContext(quoteHandoff, { sourceMessageId: "msg-1", organizationId: "org1" });
    const outcome = await resolveGeneralOrchestrationPlan({ utterance: "Onu da tamamla.", auth, generateText, previousContext });
    expect(outcome.status).toBe("CLARIFICATION_REQUIRED");
  });

  it("a FAILED prior operation produces no continuity context at all — falls back to ordinary clarification", async () => {
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "plan", steps: [{ action: "task.complete", args: {} }] }));
    const failedHandoff = {
      operation: "UPDATE", outcomeCode: "TASK_FAILED", resultStatus: "FAILED",
      entityResolution: "RESOLVED", entityDomain: "tasks", entityId: "task-1", entityDisplayName: "Teklif takibi",
      candidateNames: [], fieldNames: [], mutationPerformed: false,
      navigationRequested: false, navigationStatus: "NOT_REQUESTED", approvalRequired: false,
    } as unknown as import("@/lib/conversation-extensions/conversation-extension-handoff").ConversationExtensionHandoff;
    const previousContext = buildLastSuccessfulOperationContext(failedHandoff, { sourceMessageId: "msg-1", organizationId: "org1" });
    expect(previousContext).toBeNull();
    const outcome = await resolveGeneralOrchestrationPlan({ utterance: "Onu da tamamla.", auth, generateText, previousContext });
    expect(outcome.status).toBe("CLARIFICATION_REQUIRED");
  });

  it("omitting previousContext entirely (every pre-existing caller) is byte-for-byte the old behavior", async () => {
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "plan", steps: [{ action: "task.complete", args: {} }] }));
    const outcome = await resolveGeneralOrchestrationPlan({ utterance: "bir görevi tamamla", auth, generateText });
    expect(outcome.status).toBe("CLARIFICATION_REQUIRED");
  });

  it("a domain-incompatible prior context on an OPTIONAL entity field is simply left unset — never force-attached", async () => {
    resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "evt-1", label: "Yarın toplantı" });
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({
      result: "plan",
      steps: [{ action: "calendar_event.create", args: { title: "Toplantı", startAt: "2026-05-01T10:00:00.000Z", endAt: "2026-05-01T11:00:00.000Z" } }],
    }));
    const outcome = await resolveGeneralOrchestrationPlan({
      utterance: "Bir de yarın toplantı koy.", auth, generateText, previousContext: taskContext("task-1"),
    });
    if (outcome.status !== "PLAN_READY") throw new Error(`expected PLAN_READY, got ${outcome.status}`);
    expect(outcome.plan.steps[0]!.actionName).toBe("calendar_event.create");
    expect(outcome.plan.steps[0]!.argsTemplate.relatedTaskId).toBeUndefined();
    expect(outcome.plan.steps[0]!.argsTemplate.relatedCustomerId).toBeUndefined();
  });
});
