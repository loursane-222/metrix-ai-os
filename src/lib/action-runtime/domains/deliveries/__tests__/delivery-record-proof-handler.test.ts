import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordProofOfDeliveryMock } = vi.hoisted(() => ({ recordProofOfDeliveryMock: vi.fn() }));
vi.mock("@/lib/core/deliveries/delivery-intelligence.service", () => ({ recordProofOfDelivery: recordProofOfDeliveryMock }));

import { handleDeliveryRecordProof } from "../delivery-record-proof-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "delivery.recordProof",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["deliveries.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleDeliveryRecordProof", () => {
  beforeEach(() => recordProofOfDeliveryMock.mockReset());

  it("records proof through the exact same canonical service PATCH /api/deliveries/[deliveryId] (action: proof) already called", async () => {
    recordProofOfDeliveryMock.mockResolvedValue({ id: "d1" });
    const result = await handleDeliveryRecordProof(envelope({ deliveryId: "d1", confirmationCode: "KOD-42" }));
    expect(recordProofOfDeliveryMock).toHaveBeenCalledWith("d1", "org-1", { confirmationCode: "KOD-42", receiverName: undefined, note: undefined });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "delivery", entityId: "d1" } });
  });

  it("rejects a missing deliveryId before calling the service", async () => {
    await expect(handleDeliveryRecordProof(envelope({ confirmationCode: "KOD-42" }))).rejects.toThrow(/deliveryId/);
    expect(recordProofOfDeliveryMock).not.toHaveBeenCalled();
  });

  it("rejects when none of confirmationCode/receiverName/note is provided", async () => {
    await expect(handleDeliveryRecordProof(envelope({ deliveryId: "d1" }))).rejects.toThrow(/confirmationCode, receiverName, or note/);
    expect(recordProofOfDeliveryMock).not.toHaveBeenCalled();
  });

  it("throws when the delivery is not found", async () => {
    recordProofOfDeliveryMock.mockResolvedValue(null);
    await expect(handleDeliveryRecordProof(envelope({ deliveryId: "d1", note: "teslim edildi" }))).rejects.toThrow(/not found/);
  });
});
