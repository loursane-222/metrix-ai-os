import { describe, expect, it, vi, beforeEach } from "vitest";

const { findManyMock, createCollectionActionMock, findOpenActionByPaymentAndTypeMock, logActionCreatedMock } =
  vi.hoisted(() => ({
    findManyMock: vi.fn(),
    createCollectionActionMock: vi.fn(),
    findOpenActionByPaymentAndTypeMock: vi.fn(),
    logActionCreatedMock: vi.fn(),
  }));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    payment: {
      findMany: findManyMock,
    },
  },
}));

vi.mock("../collection-action.repository", () => ({
  createCollectionAction: createCollectionActionMock,
  findOpenActionByPaymentAndType: findOpenActionByPaymentAndTypeMock,
}));

vi.mock("../collection-action-event.service", () => ({
  logActionCreated: logActionCreatedMock,
}));

import { syncAiCollectionActions } from "../collection-action-sync.service";

function buildPayment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "payment-1",
    customerId: null,
    title: "Kasım Faturası",
    amount: "1000",
    paidAmount: "400",
    status: "PARTIAL",
    dueDate: null,
    person: { fullName: "Zensoft Teknoloji A.Ş." },
    ...overrides,
  };
}

describe("syncAiCollectionActions", () => {
  beforeEach(() => {
    findManyMock.mockReset();
    createCollectionActionMock.mockReset();
    findOpenActionByPaymentAndTypeMock.mockReset();
    logActionCreatedMock.mockReset();
    findOpenActionByPaymentAndTypeMock.mockResolvedValue(null);
    createCollectionActionMock.mockResolvedValue({ id: "action-1" });
  });

  it("inherits Payment.customerId onto the new CollectionAction", async () => {
    findManyMock.mockResolvedValue([buildPayment({ customerId: "cust-1" })]);

    await syncAiCollectionActions("org-1");

    expect(createCollectionActionMock).toHaveBeenCalledTimes(1);
    expect(createCollectionActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "payment-1", customerId: "cust-1" }),
    );
  });

  it("keeps customerId null when the Payment has no customerId yet (legacy path)", async () => {
    findManyMock.mockResolvedValue([buildPayment({ customerId: null })]);

    await syncAiCollectionActions("org-1");

    expect(createCollectionActionMock).toHaveBeenCalledTimes(1);
    expect(createCollectionActionMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "payment-1", customerId: null }),
    );
  });

  it("does not create a new action when an open one already exists for the payment", async () => {
    findOpenActionByPaymentAndTypeMock.mockResolvedValue({ id: "existing-action" });
    findManyMock.mockResolvedValue([buildPayment({ customerId: "cust-1" })]);

    const result = await syncAiCollectionActions("org-1");

    expect(createCollectionActionMock).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 0, skipped: 1 });
  });
});
