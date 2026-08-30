import { describe, expect, it, vi, beforeEach } from "vitest";

const { updatePurchaseOrderStatusMock } = vi.hoisted(() => ({
  updatePurchaseOrderStatusMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(currentTx)) },
}));

vi.mock("../purchase-order.repository", async () => {
  const actual = await vi.importActual<typeof import("../purchase-order.repository")>("../purchase-order.repository");
  return { ...actual, updatePurchaseOrderStatus: updatePurchaseOrderStatusMock };
});

import { PurchaseOrderConcurrentlyModifiedError } from "../purchase-order.repository";
import { cancelPurchaseOrder, transitionPurchaseOrderStatus } from "../purchase-order.service";

let currentTx: { purchaseOrder: { findFirst: ReturnType<typeof vi.fn> } };

function setOrderRead(order: { status: string }) {
  currentTx = { purchaseOrder: { findFirst: vi.fn().mockResolvedValue({ id: "po-1", poNumber: "PO-0001", ...order }) } };
  return currentTx;
}

describe("PurchaseOrder status transition concurrency (CAS)", () => {
  beforeEach(() => {
    updatePurchaseOrderStatusMock.mockReset();
  });

  it("passes the just-read status as the CAS fromStatus", async () => {
    const tx = setOrderRead({ status: "DRAFT" });
    updatePurchaseOrderStatusMock.mockResolvedValue({ count: 1 });

    await transitionPurchaseOrderStatus({ purchaseOrderId: "po-1", organizationId: "org-1", toStatus: "APPROVED" });

    expect(updatePurchaseOrderStatusMock).toHaveBeenCalledWith("po-1", "org-1", "DRAFT", "APPROVED", {}, tx);
  });

  it("surfaces a concurrent transition as a 409", async () => {
    setOrderRead({ status: "DRAFT" });
    updatePurchaseOrderStatusMock.mockRejectedValue(new PurchaseOrderConcurrentlyModifiedError("po-1"));

    await expect(transitionPurchaseOrderStatus({ purchaseOrderId: "po-1", organizationId: "org-1", toStatus: "APPROVED" })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects an out-of-graph transition (e.g. DRAFT straight to RECEIVED) before ever touching the repository", async () => {
    setOrderRead({ status: "DRAFT" });
    await expect(transitionPurchaseOrderStatus({ purchaseOrderId: "po-1", organizationId: "org-1", toStatus: "RECEIVED" })).rejects.toMatchObject({ status: 409 });
    expect(updatePurchaseOrderStatusMock).not.toHaveBeenCalled();
  });

  it("surfaces a concurrent cancel as a 409", async () => {
    setOrderRead({ status: "APPROVED" });
    updatePurchaseOrderStatusMock.mockRejectedValue(new PurchaseOrderConcurrentlyModifiedError("po-1"));

    await expect(cancelPurchaseOrder({ purchaseOrderId: "po-1", organizationId: "org-1", reason: "test" })).rejects.toMatchObject({ status: 409 });
  });

  it("cannot cancel a fully RECEIVED purchase order (terminal state)", async () => {
    setOrderRead({ status: "RECEIVED" });
    await expect(cancelPurchaseOrder({ purchaseOrderId: "po-1", organizationId: "org-1", reason: "test" })).rejects.toMatchObject({ status: 409 });
    expect(updatePurchaseOrderStatusMock).not.toHaveBeenCalled();
  });
});
