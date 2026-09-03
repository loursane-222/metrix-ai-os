import { describe, expect, it, vi } from "vitest";

const { requestOrchestrationPlanAndRunMock } = vi.hoisted(() => ({ requestOrchestrationPlanAndRunMock: vi.fn() }));
vi.mock("@/lib/executive-orchestration/executive-orchestration-client", () => ({
  requestOrchestrationPlanAndRun: requestOrchestrationPlanAndRunMock,
}));

import { orchestrationConversationExtension } from "../orchestration-conversation-extension";
import { setActiveConversationId } from "../active-conversation-session";

describe("orchestrationConversationExtension — conversation continuity plumbing", () => {
  it("passes the active conversationId through so the server can look up prior canonical entity context", async () => {
    setActiveConversationId("conv-42");
    requestOrchestrationPlanAndRunMock.mockResolvedValue({ status: "NOT_HANDLED" });
    await orchestrationConversationExtension.execute("bir şey yap");
    expect(requestOrchestrationPlanAndRunMock).toHaveBeenCalledWith("bir şey yap", "conv-42");
    setActiveConversationId(null);
  });
});

describe("orchestrationConversationExtension — compensation outcomes", () => {
  // Regression: an orchestration that fails but gets fully reversed, or
  // whose reversal itself fails, must never be narrated as success or
  // silently folded into the generic FAILED branch — see
  // executive-orchestration.service.ts's runCompensationPass.
  it("produces a distinct outcomeCode for COMPENSATED (failed but cleanly reversed)", async () => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({
      status: "RUN_COMPLETE",
      summary: "2 adımlı bir işlem",
      orchestration: { id: "o1", status: "COMPENSATED", triggerUtterance: "sipariş oluştur, sonra fatura kes", steps: [] },
    });

    const result = await orchestrationConversationExtension.execute("sipariş oluştur, sonra fatura kes");

    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.outcomeCode).toBe("ORCHESTRATION_COMPENSATED");
    expect(result.handoff?.resultStatus).toBe("FAILED");
  });

  it("produces a distinct, loudly-surfaced outcomeCode for COMPENSATION_FAILED", async () => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({
      status: "RUN_COMPLETE",
      summary: "2 adımlı bir işlem",
      orchestration: { id: "o1", status: "COMPENSATION_FAILED", triggerUtterance: "sipariş oluştur, sonra fatura kes", steps: [] },
    });

    const result = await orchestrationConversationExtension.execute("sipariş oluştur, sonra fatura kes");

    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.outcomeCode).toBe("ORCHESTRATION_COMPENSATION_FAILED");
    expect(result.handoff?.resultStatus).toBe("FAILED");
  });

  it("produces PLAN_INVALID when the resolver rejects an irreversible-not-last plan", async () => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({ status: "PLAN_INVALID", reason: "quote.dispatch must be last" });

    const result = await orchestrationConversationExtension.execute("teklifi gönder, sonra görev oluştur");

    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.outcomeCode).toBe("ORCHESTRATION_PLAN_INVALID");
    expect(result.handoff?.resultStatus).toBe("FAILED");
  });
});

describe("orchestrationConversationExtension — gate-free reachability", () => {
  // The ACTION_VERB_STEM pre-filter (a hand-enumerated Turkish verb regex)
  // was removed: it silently excluded any verb form it didn't anticipate
  // ("yap", "olsun", ...), so a real, executable UPDATE utterance using one
  // of those forms never reached this already-generic fallback at all. This
  // proves an utterance using exactly such a form now reaches the resolver.
  it("still calls the resolver for an utterance using a verb the old gate excluded", async () => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({ status: "NOT_HANDLED" });

    const result = await orchestrationConversationExtension.execute("müşterinin telefonunu 0532 111 22 33 yap");

    expect(requestOrchestrationPlanAndRunMock).toHaveBeenCalledWith("müşterinin telefonunu 0532 111 22 33 yap", null);
    expect(result).toEqual({ status: "NOT_HANDLED", handoff: null });
  });

  it("still declines genuinely non-action chit-chat via the resolver's own classification, not a local gate", async () => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({ status: "NOT_HANDLED" });

    const result = await orchestrationConversationExtension.execute("bugün hava nasıl?");

    expect(requestOrchestrationPlanAndRunMock).toHaveBeenCalledWith("bugün hava nasıl?", null);
    expect(result).toEqual({ status: "NOT_HANDLED", handoff: null });
  });
});

describe("orchestrationConversationExtension — operation-continuity projection", () => {
  // lastSuccessfulOperationContext (see last-operation-context.ts) needs a
  // real entityId/entityDomain from ANY domain that reaches Action Runtime
  // through this shared fallback, with zero per-domain code — sourced here
  // from OrchestrationStepView's own already-populated resultEntityId/domain
  // (the orchestration engine needs these itself for $stepN references).
  it("populates entityId/entityDomain from a single completed step", async () => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({
      status: "RUN_COMPLETE",
      summary: "1 adımlı bir işlem",
      orchestration: {
        id: "o1", status: "COMPLETED", triggerUtterance: "tedarikçinin telefonunu değiştir",
        steps: [{ sequence: 1, domain: "suppliers", actionName: "supplier.update", status: "COMPLETED", resultEntityType: "Supplier", resultEntityId: "supplier-1", errorMessage: null }],
      },
    });

    const result = await orchestrationConversationExtension.execute("tedarikçinin telefonunu değiştir");

    expect(result).toMatchObject({ status: "HANDOFF", handoff: { entityId: "supplier-1", entityDomain: "suppliers", domain: "orchestrations", mutationPerformed: true } });
  });

  // Regression: this branch used to hardcode operation: "CREATE" regardless
  // of the actual action that ran, which meant lastSuccessfulOperationContext
  // recorded a customer.update/supplier.update as a CREATE. The real
  // operation is now derived from the single step's own actionName.
  it.each([
    ["customer.update", "UPDATE"],
    ["supplier.update", "UPDATE"],
    ["task.create", "CREATE"],
  ])("derives operation %s -> %s from the single step's actionName, not a hardcoded CREATE", async (actionName, expectedOperation) => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({
      status: "RUN_COMPLETE",
      summary: "1 adımlı bir işlem",
      orchestration: {
        id: "o1", status: "COMPLETED", triggerUtterance: "test",
        steps: [{ sequence: 1, domain: "customers", actionName, status: "COMPLETED", resultEntityType: "X", resultEntityId: "entity-1", errorMessage: null }],
      },
    });

    const result = await orchestrationConversationExtension.execute("test");

    expect(result).toMatchObject({ status: "HANDOFF", handoff: { operation: expectedOperation } });
  });

  it("leaves entityId/entityDomain null for a multi-step plan (deliberately ambiguous, never guessed)", async () => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({
      status: "RUN_COMPLETE",
      summary: "2 adımlı bir işlem",
      orchestration: {
        id: "o1", status: "COMPLETED", triggerUtterance: "sipariş oluştur, sonra irsaliyesini kes",
        steps: [
          { sequence: 1, domain: "orders", actionName: "order.create", status: "COMPLETED", resultEntityType: "Order", resultEntityId: "order-1", errorMessage: null },
          { sequence: 2, domain: "deliveries", actionName: "delivery.create", status: "COMPLETED", resultEntityType: "Delivery", resultEntityId: "delivery-1", errorMessage: null },
        ],
      },
    });

    const result = await orchestrationConversationExtension.execute("sipariş oluştur, sonra irsaliyesini kes");

    expect(result).toMatchObject({ status: "HANDOFF", handoff: { entityId: null, entityDomain: null } });
  });

  it("leaves entityId null when the single step's domain isn't a known conversation-extension domain", async () => {
    requestOrchestrationPlanAndRunMock.mockResolvedValue({
      status: "RUN_COMPLETE",
      summary: "1 adımlı bir işlem",
      orchestration: {
        id: "o1", status: "COMPLETED", triggerUtterance: "bir şey yap",
        steps: [{ sequence: 1, domain: "unknown-domain", actionName: "unknown.update", status: "COMPLETED", resultEntityType: "X", resultEntityId: "x-1", errorMessage: null }],
      },
    });

    const result = await orchestrationConversationExtension.execute("bir şey yap");

    expect(result).toMatchObject({ status: "HANDOFF", handoff: { entityId: null, entityDomain: null } });
  });
});
