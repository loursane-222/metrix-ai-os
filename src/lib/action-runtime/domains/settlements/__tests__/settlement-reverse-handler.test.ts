import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { reverseSettlementMock } = vi.hoisted(() => ({ reverseSettlementMock: vi.fn() }));
vi.mock("@/lib/core/settlements/settlement.service", () => ({ reverseSettlement: reverseSettlementMock }));

import { settlementReverseHandler } from "../settlement-reverse-handler";

const envelope = (input: Record<string, unknown>, entityRef: { entityType: string; entityId: string } | undefined = { entityType: "settlement", entityId: "settlement-1" }) => ({
  executionId: "exec-1",
  actionName: "settlement.reverse",
  input,
  entityRef,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["payments.reverse"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("settlementReverseHandler", () => {
  beforeEach(() => { reverseSettlementMock.mockReset(); });

  it("reverses the addressed settlement through the canonical service", async () => {
    reverseSettlementMock.mockResolvedValue({
      payment: { id: "payment-1", status: "PARTIAL", paidAmount: "400.00" },
      settlement: { id: "reversal-1", amount: "600.00", currency: "TRY" },
      application: { id: "reversal-application-1" },
      movement: { id: "reversal-movement-1" },
    });

    const result = await settlementReverseHandler(envelope({ settlementId: "settlement-1", reason: "yanlış tutar girildi" }));

    expect(reverseSettlementMock).toHaveBeenCalledWith({ organizationId: "org-1", settlementId: "settlement-1", reason: "yanlış tutar girildi", actorId: "user-1" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "settlement", entityId: "settlement-1" }, metadata: { settlementId: "settlement-1", reversalSettlementId: "reversal-1", paymentStatus: "PARTIAL" } });
    expect(result.domainEvents).toEqual([
      expect.objectContaining({
        eventType: "SettlementReversed",
        aggregateType: "settlement",
        aggregateId: "reversal-1",
        payload: expect.objectContaining({ originalSettlementId: "settlement-1", reversalSettlementId: "reversal-1", paymentId: "payment-1" }),
        deduplicationKey: "settlement-reversed:reversal-1",
      }),
    ]);
  });

  it("fails when settlement is not found in this organization", async () => {
    reverseSettlementMock.mockResolvedValue(null);
    const result = await settlementReverseHandler(envelope({ settlementId: "settlement-1", reason: "yanlış tutar" }));
    expect(result).toMatchObject({ status: "FAILURE" });
  });

  it("rejects a missing settlementId before mutation", async () => {
    await expect(settlementReverseHandler(envelope({ reason: "yanlış tutar" }))).rejects.toThrow(/settlementId/);
    expect(reverseSettlementMock).not.toHaveBeenCalled();
  });

  it("rejects a missing reason before mutation", async () => {
    await expect(settlementReverseHandler(envelope({ settlementId: "settlement-1" }))).rejects.toThrow(/reason/);
    expect(reverseSettlementMock).not.toHaveBeenCalled();
  });

  it("rejects an entityRef that doesn't match the addressed settlement", async () => {
    await expect(
      settlementReverseHandler(envelope({ settlementId: "settlement-1", reason: "yanlış tutar" }, { entityType: "settlement", entityId: "settlement-2" })),
    ).rejects.toThrow("ACTION_TARGET_CONTEXT_MISMATCH");
  });
});
