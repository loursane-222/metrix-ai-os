import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Stage 1 Production Reliability Closure — proven live in production:
 * delivery.createFromOrder reported a real, existing order (SIP-0001) as
 * NOT_FOUND, and payment.create reported a real, existing customer as
 * NOT_FOUND, both because execute_business_action handed the Agent's
 * plain-label argument (the order number / customer name) straight to
 * runOrchestration with zero entity-reference resolution. Resolution only
 * ever existed in general-plan-resolver.ts, a separate orchestration path
 * this tool never called. These tests prove the fix: the SAME
 * entity-resolvers.ts map/function general-plan-resolver.ts already uses
 * is now applied here too, before runOrchestration ever runs.
 */
const mocks = vi.hoisted(() => ({
  runOrchestration: vi.fn(),
  resolveEntityReference: vi.fn(),
}));

vi.mock("@/lib/executive-orchestration/executive-orchestration.service", () => ({ runOrchestration: mocks.runOrchestration }));
vi.mock("@/lib/executive-orchestration/entity-resolvers", () => ({
  resolveEntityReference: mocks.resolveEntityReference,
  ENTITY_REFERENCE_FIELDS: { customerId: "customer", sourceOrderId: "order" },
}));

const { buildExecuteBusinessActionTool } = await import("../action-tools");

const runContext = { organizationId: "org-1", actorId: "user-1", authContext: { organization: { id: "org-1" } } } as never;

async function invoke(stepsJson: string): Promise<{ data: unknown }> {
  const tool = buildExecuteBusinessActionTool(runContext);
  const result = await (tool as { invoke: (ctx: never, input: string) => Promise<unknown> }).invoke({ context: runContext } as never, JSON.stringify({ stepsJson }));
  return result as { data: unknown };
}

describe("execute_business_action — entity-reference resolution before runOrchestration", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("resolves a plain-label entity-reference field to a real id before calling runOrchestration", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "order-real-id", label: "SIP-0001" });
    mocks.runOrchestration.mockResolvedValue({ status: "COMPLETED", steps: [] });
    await invoke(JSON.stringify([{ domain: "delivery", actionName: "delivery.createFromOrder", args: { sourceOrderId: "SIP-0001" } }]));
    expect(mocks.resolveEntityReference).toHaveBeenCalledWith("order", "org-1", "SIP-0001");
    expect(mocks.runOrchestration).toHaveBeenCalledWith(expect.objectContaining({
      plan: { steps: [{ domain: "delivery", actionName: "delivery.createFromOrder", argsTemplate: { sourceOrderId: "order-real-id" } }] },
    }));
  });

  it("returns a clean ENTITY_REFERENCE_UNRESOLVED result and never calls runOrchestration when the reference is NOT_FOUND", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "NOT_FOUND" });
    const result = await invoke(JSON.stringify([{ domain: "payment", actionName: "payment.create", args: { customerId: "Bilinmeyen Müşteri", title: "x", amount: 100 } }]));
    expect(mocks.runOrchestration).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ status: "ENTITY_REFERENCE_UNRESOLVED", field: "customerId", reference: "Bilinmeyen Müşteri" });
  });

  it("passes a {$stepRef} value through untouched — resolved later, at actual execution time, not here", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "customer-1", label: "Atlas" });
    mocks.runOrchestration.mockResolvedValue({ status: "COMPLETED", steps: [] });
    await invoke(JSON.stringify([
      { domain: "order", actionName: "order.create", args: { customerId: "Atlas" } },
      { domain: "delivery", actionName: "delivery.createFromOrder", args: { sourceOrderId: { $stepRef: 0 } } },
    ]));
    expect(mocks.resolveEntityReference).toHaveBeenCalledTimes(1);
    expect(mocks.resolveEntityReference).not.toHaveBeenCalledWith("order", "org-1", expect.anything());
    expect(mocks.runOrchestration).toHaveBeenCalledWith(expect.objectContaining({
      plan: { steps: expect.arrayContaining([
        expect.objectContaining({ actionName: "delivery.createFromOrder", argsTemplate: { sourceOrderId: { $stepRef: 0 } } }),
      ]) },
    }));
  });

  it("leaves non-entity-reference fields (title, amount) completely unchanged", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "customer-1", label: "Atlas" });
    mocks.runOrchestration.mockResolvedValue({ status: "COMPLETED", steps: [] });
    await invoke(JSON.stringify([{ domain: "payment", actionName: "payment.create", args: { customerId: "Atlas", title: "Ödeme", amount: 2500 } }]));
    expect(mocks.runOrchestration).toHaveBeenCalledWith(expect.objectContaining({
      plan: { steps: [{ domain: "payment", actionName: "payment.create", argsTemplate: { customerId: "customer-1", title: "Ödeme", amount: 2500 } }] },
    }));
  });
});
