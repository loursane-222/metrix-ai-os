import { describe, expect, it, vi } from "vitest";

const listOrders = vi.fn();
vi.mock("@/lib/core/orders/order.service", () => ({ listOrders: (...args: unknown[]) => listOrders(...args) }));

const { previewDeliveryImport, buildPropositionsFromReviewedRows } = await import("../delivery-import.service");

const ORDER = { id: "o1", orderNumber: "0001", customerId: "c1" };

describe("previewDeliveryImport", () => {
  it("skips rows missing orderNumberRef", async () => {
    listOrders.mockResolvedValue([ORDER]);
    const preview = await previewDeliveryImport({
      organizationId: "org1",
      headers: ["Sipariş No", "Not"],
      rows: [
        { "Sipariş No": "", "Not": "Acil" },
        { "Sipariş No": "0001", "Not": "Acil" },
      ],
    });
    expect(preview.rows).toHaveLength(1);
    expect(preview.totalRows).toBe(2);
  });

  it("resolves a row's order and excludes it only when unresolved", async () => {
    listOrders.mockResolvedValue([ORDER]);
    const preview = await previewDeliveryImport({
      organizationId: "org1",
      headers: ["Sipariş No"],
      rows: [
        { "Sipariş No": "0001" },
        { "Sipariş No": "9999" },
      ],
    });
    expect(preview.rows[0]!.orderMatch).toEqual({ status: "RESOLVED", orderId: "o1", orderNumber: "0001", customerId: "c1" });
    expect(preview.rows[0]!.excluded).toBe(false);
    expect(preview.rows[1]!.orderMatch).toEqual({ status: "NOT_FOUND" });
    expect(preview.rows[1]!.excluded).toBe(true);
    expect(preview.unresolvedOrderCount).toBe(1);
  });
});

describe("buildPropositionsFromReviewedRows (deliveries)", () => {
  it("builds one CREATE proposition per included row with sourceOrderId and customerId substituted in", () => {
    const propositions = buildPropositionsFromReviewedRows([
      {
        rowIndex: 0,
        values: { orderNumberRef: "0001", carrier: "Aras Kargo" },
        orderMatch: { status: "RESOLVED", orderId: "o1", orderNumber: "0001", customerId: "c1" },
        excluded: false,
      },
      {
        rowIndex: 1,
        values: { orderNumberRef: "9999" },
        orderMatch: { status: "NOT_FOUND" },
        excluded: true,
      },
    ]);
    expect(propositions).toHaveLength(1);
    expect(propositions[0]!.targetDomain).toBe("Delivery");
    expect(propositions[0]!.operation).toBe("CREATE");
    expect(propositions[0]!.changes).toEqual([
      { fieldPath: "sourceOrderId", proposedValue: "o1" },
      { fieldPath: "customerId", proposedValue: "c1" },
      { fieldPath: "carrier", proposedValue: "Aras Kargo" },
    ]);
  });
});
