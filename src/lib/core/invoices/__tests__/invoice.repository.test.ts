import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { findInvoicedQuantityRowsForOrderItem } from "../invoice.repository";

describe("findInvoicedQuantityRowsForOrderItem — CANCELLED invoices never consume invoicing capacity", () => {
  it("excludes CANCELLED invoices from the cumulative-invoiced query", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const tx = { invoiceItem: { findMany } } as never;

    await findInvoicedQuantityRowsForOrderItem("item-1", "org-1", tx);

    expect(findMany).toHaveBeenCalledWith({
      where: { orderItemId: "item-1", organizationId: "org-1", invoice: { status: { not: "CANCELLED" } } },
      select: { quantity: true },
    });
  });
});
