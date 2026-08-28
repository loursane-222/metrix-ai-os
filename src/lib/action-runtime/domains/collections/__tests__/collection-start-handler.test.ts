import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findPaymentByIdMock,
  findOpenActionByPaymentAndTypeMock,
  createCollectionActionMock,
  updateCollectionActionLifecycleMock,
} = vi.hoisted(() => ({
  findPaymentByIdMock: vi.fn(),
  findOpenActionByPaymentAndTypeMock: vi.fn(),
  createCollectionActionMock: vi.fn(),
  updateCollectionActionLifecycleMock: vi.fn(),
}));
vi.mock("@/lib/core/payments/payment.service", () => ({
  findPaymentById: findPaymentByIdMock,
}));
vi.mock("@/lib/core/collection-actions/collection-action.repository", () => ({
  findOpenActionByPaymentAndType: findOpenActionByPaymentAndTypeMock,
  createCollectionAction: createCollectionActionMock,
  updateCollectionActionLifecycle: updateCollectionActionLifecycleMock,
}));

import { collectionStartHandler } from "../collection-start-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "collection.start",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["collections.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("collectionStartHandler", () => {
  beforeEach(() => {
    findPaymentByIdMock.mockReset();
    findOpenActionByPaymentAndTypeMock.mockReset();
    createCollectionActionMock.mockReset();
    updateCollectionActionLifecycleMock.mockReset();
  });

  it("creates a new USER_CREATED action and marks it IN_PROGRESS when none exists yet", async () => {
    findPaymentByIdMock.mockResolvedValue({ id: "pay1", title: "Eylül faturası" });
    findOpenActionByPaymentAndTypeMock.mockResolvedValue(null);
    createCollectionActionMock.mockResolvedValue({ id: "ca1" });

    const result = await collectionStartHandler(envelope({ paymentId: "pay1" }));

    expect(createCollectionActionMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      paymentId: "pay1",
      actionType: "FOLLOW_UP",
      source: "USER_CREATED",
    }));
    expect(updateCollectionActionLifecycleMock).toHaveBeenCalledWith({ id: "ca1", organizationId: "org-1", status: "IN_PROGRESS" });
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "collection_action", entityId: "ca1" } });
  });

  it("reuses an existing open action for the same payment and type instead of creating a duplicate", async () => {
    findPaymentByIdMock.mockResolvedValue({ id: "pay1", title: "Eylül faturası" });
    findOpenActionByPaymentAndTypeMock.mockResolvedValue({ id: "ca-existing" });

    const result = await collectionStartHandler(envelope({ paymentId: "pay1", actionType: "CALL" }));

    expect(createCollectionActionMock).not.toHaveBeenCalled();
    expect(updateCollectionActionLifecycleMock).toHaveBeenCalledWith({ id: "ca-existing", organizationId: "org-1", status: "IN_PROGRESS" });
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE", entityRef: { entityType: "collection_action", entityId: "ca-existing" } });
  });

  it("falls back to FOLLOW_UP for an invalid actionType", async () => {
    findPaymentByIdMock.mockResolvedValue({ id: "pay1", title: "Eylül faturası" });
    findOpenActionByPaymentAndTypeMock.mockResolvedValue(null);
    createCollectionActionMock.mockResolvedValue({ id: "ca1" });

    await collectionStartHandler(envelope({ paymentId: "pay1", actionType: "not-a-real-type" }));

    expect(findOpenActionByPaymentAndTypeMock).toHaveBeenCalledWith("org-1", "pay1", "FOLLOW_UP");
  });

  it("rejects a missing paymentId before any lookup", async () => {
    await expect(collectionStartHandler(envelope({}))).rejects.toThrow(/paymentId/);
    expect(findPaymentByIdMock).not.toHaveBeenCalled();
  });

  it("rejects when the payment does not exist in this organization", async () => {
    findPaymentByIdMock.mockResolvedValue(null);

    await expect(collectionStartHandler(envelope({ paymentId: "pay-missing" }))).rejects.toThrow(/not found/i);
    expect(createCollectionActionMock).not.toHaveBeenCalled();
  });
});
