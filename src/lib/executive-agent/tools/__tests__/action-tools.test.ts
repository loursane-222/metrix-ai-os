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
  ENTITY_REFERENCE_FIELDS: { customerId: "customer", sourceOrderId: "order", quoteId: "quote" },
}));

const { buildExecuteBusinessActionTool } = await import("../action-tools");

const baseRunContext = { organizationId: "org-1", actorId: "user-1", authContext: { organization: { id: "org-1" }, user: { id: "user-1" } }, currentTurnMessage: "" };

async function invoke(stepsJson: string, currentTurnMessage = ""): Promise<{ data: unknown }> {
  const context = { ...baseRunContext, currentTurnMessage } as never;
  const tool = buildExecuteBusinessActionTool(context);
  const result = await (tool as { invoke: (ctx: never, input: string) => Promise<unknown> }).invoke({ context } as never, JSON.stringify({ stepsJson }));
  return result as { data: unknown };
}

describe("execute_business_action — entity-reference resolution before runOrchestration", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("resolves a plain-label entity-reference field to a real id before calling runOrchestration", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "order-real-id", label: "SIP-0001" });
    mocks.runOrchestration.mockResolvedValue({ status: "COMPLETED", steps: [] });
    await invoke(JSON.stringify([{ domain: "delivery", actionName: "delivery.createFromOrder", args: { sourceOrderId: "SIP-0001" } }]));
    expect(mocks.resolveEntityReference).toHaveBeenCalledWith("order", "org-1", "SIP-0001", "user-1");
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
    await invoke(
      JSON.stringify([{ domain: "payment", actionName: "payment.create", args: { customerId: "Atlas", title: "Ödeme", amount: 2500 } }]),
      "Atlas için 2500 TL'lik Ödeme adında bir tahsilat kaydet.",
    );
    expect(mocks.runOrchestration).toHaveBeenCalledWith(expect.objectContaining({
      plan: { steps: [{ domain: "payment", actionName: "payment.create", argsTemplate: { customerId: "customer-1", title: "Ödeme", amount: 2500 } }] },
    }));
  });
});

/**
 * Stage 1 Production Reliability Closure — write-argument authority.
 * Proven live: "Bu müşterinin telefonunu değiştir." (no number given this
 * turn) resulted in the Agent using a phone number from ~20 turns earlier
 * as the "new" value. These tests prove customer.update/quote.update
 * (the shared `patch: { type: "json" }` convention — see
 * write-argument-provenance.ts's own header) can no longer write a value
 * that has no provenance in the CURRENT turn's own message, regardless of
 * domain, without any per-domain (phone-specific) code.
 */
describe("execute_business_action — write-argument provenance (patch values must trace to the current turn, never history)", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("(A) rejects a stale value with no relation to the current turn's own message — never mutates, never calls runOrchestration", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "customer-1", label: "GC Kabul Müşteri 1" });
    const result = await invoke(
      JSON.stringify([{ domain: "customer", actionName: "customer.update", args: { customerId: "GC Kabul Müşteri 1", expectedVersion: "2026-01-01T00:00:00.000Z", patch: { phone: "905324445566" } } }]),
      "Bu müşterinin telefonunu değiştir.",
    );
    expect(mocks.runOrchestration).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ status: "WRITE_VALUE_PROVENANCE_UNVERIFIED", field: "phone", value: "905324445566" });
  });

  it("(B) allows a value explicitly stated in the current turn's own message", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "customer-1", label: "GC Kabul Müşteri 1" });
    mocks.runOrchestration.mockResolvedValue({ status: "COMPLETED", steps: [] });
    const result = await invoke(
      JSON.stringify([{ domain: "customer", actionName: "customer.update", args: { customerId: "GC Kabul Müşteri 1", expectedVersion: "2026-01-01T00:00:00.000Z", patch: { phone: "905551112233" } } }]),
      "Bu müşterinin telefonunu 0555 111 22 33 yap.",
    );
    expect(mocks.runOrchestration).toHaveBeenCalled();
    expect(result.data).not.toMatchObject({ status: "WRITE_VALUE_PROVENANCE_UNVERIFIED" });
  });

  it("(C) a continuation reply ('0555 111 22 33' answering METRIX's own 'yeni numara ne olsun?') is this turn's own message, so it verifies exactly like (B) — no separate pending-state tracking needed", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "customer-1", label: "GC Kabul Müşteri 1" });
    mocks.runOrchestration.mockResolvedValue({ status: "COMPLETED", steps: [] });
    const result = await invoke(
      JSON.stringify([{ domain: "customer", actionName: "customer.update", args: { customerId: "GC Kabul Müşteri 1", expectedVersion: "2026-01-01T00:00:00.000Z", patch: { phone: "905551112233" } } }]),
      "0555 111 22 33",
    );
    expect(mocks.runOrchestration).toHaveBeenCalled();
    expect(result.data).not.toMatchObject({ status: "WRITE_VALUE_PROVENANCE_UNVERIFIED" });
  });

  it("(D) a second domain — quote.update's amount — is protected by the exact same generic check, no domain-specific code", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "quote-1", label: "GC Kabul Teklif 1" });
    const staleResult = await invoke(
      JSON.stringify([{ domain: "offer", actionName: "quote.update", args: { quoteId: "GC Kabul Teklif 1", patch: { amount: 9999 } } }]),
      "Bu teklifi güncelle.",
    );
    expect(mocks.runOrchestration).not.toHaveBeenCalled();
    expect(staleResult.data).toMatchObject({ status: "WRITE_VALUE_PROVENANCE_UNVERIFIED", field: "amount" });

    mocks.runOrchestration.mockResolvedValue({ status: "COMPLETED", steps: [] });
    const explicitResult = await invoke(
      JSON.stringify([{ domain: "offer", actionName: "quote.update", args: { quoteId: "GC Kabul Teklif 1", patch: { amount: 9999 } } }]),
      "Bu teklifin tutarını 9999 TL yap.",
    );
    expect(mocks.runOrchestration).toHaveBeenCalled();
    expect(explicitResult.data).not.toMatchObject({ status: "WRITE_VALUE_PROVENANCE_UNVERIFIED" });
  });

  it("(D: stale pseudo-continuation) the same field/value pairing appearing somewhere in history is not enough without an active pending operation — this tool has no history input at all, only the current turn's own message, so a value that only ever appeared in an earlier, non-adjacent turn is structurally indistinguishable from never having been said", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "customer-1", label: "GC Kabul Müşteri 1" });
    const result = await invoke(
      JSON.stringify([{ domain: "customer", actionName: "customer.update", args: { customerId: "GC Kabul Müşteri 1", expectedVersion: "2026-01-01T00:00:00.000Z", patch: { phone: "905324445566" } } }]),
      "Bugün hava nasıl?",
    );
    expect(mocks.runOrchestration).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ status: "WRITE_VALUE_PROVENANCE_UNVERIFIED" });
  });

  it("(E: non-patch mutation, domain 1) payment.create's top-level `amount` — not patch-shaped — is protected the same way", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "customer-1", label: "Atlas" });
    const staleResult = await invoke(
      JSON.stringify([{ domain: "payment", actionName: "payment.create", args: { customerId: "Atlas", title: "Ödeme", amount: 7777 } }]),
      "Atlas'tan bir Ödeme tahsilatı kaydet.",
    );
    expect(mocks.runOrchestration).not.toHaveBeenCalled();
    expect(staleResult.data).toMatchObject({ status: "WRITE_VALUE_PROVENANCE_UNVERIFIED", field: "amount" });

    mocks.runOrchestration.mockResolvedValue({ status: "COMPLETED", steps: [] });
    const explicitResult = await invoke(
      JSON.stringify([{ domain: "payment", actionName: "payment.create", args: { customerId: "Atlas", title: "Ödeme", amount: 7777 } }]),
      "Atlas'tan 7777 TL'lik bir Ödeme tahsilatı kaydet.",
    );
    expect(mocks.runOrchestration).toHaveBeenCalled();
  });

  it("(E: non-patch mutation, domain 2) task.create's top-level `title` — not patch-shaped, free-text not numeric — is protected the same way", async () => {
    const staleResult = await invoke(
      JSON.stringify([{ domain: "task", actionName: "task.create", args: { title: "Ahmet'i ara" } }]),
      "Yeni bir görev oluştur.",
    );
    expect(mocks.runOrchestration).not.toHaveBeenCalled();
    expect(staleResult.data).toMatchObject({ status: "WRITE_VALUE_PROVENANCE_UNVERIFIED", field: "title" });

    mocks.runOrchestration.mockResolvedValue({ status: "COMPLETED", steps: [] });
    const explicitResult = await invoke(
      JSON.stringify([{ domain: "task", actionName: "task.create", args: { title: "Ahmet'i ara" } }]),
      "Ahmet'i ara diye bir görev oluştur.",
    );
    expect(mocks.runOrchestration).toHaveBeenCalled();
  });

  it("(F) false-positive numeric matching: a short number never verifies just because it is a substring of an unrelated, longer one in the message", async () => {
    const result = await invoke(
      JSON.stringify([{ domain: "task", actionName: "task.create", args: { title: "100" } }]),
      "Bu ay 1000 birim sattık, ona göre bir görev oluştur.",
    );
    expect(mocks.runOrchestration).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ status: "WRITE_VALUE_PROVENANCE_UNVERIFIED", field: "title" });
  });
});
