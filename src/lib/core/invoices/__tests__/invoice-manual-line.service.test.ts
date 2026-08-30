import { Prisma } from "@prisma/client";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { createInvoiceMock, createInvoiceItemsMock, countInvoicesForOrganizationMock, findInvoiceByIdempotencyKeyMock } = vi.hoisted(() => ({
  createInvoiceMock: vi.fn(),
  createInvoiceItemsMock: vi.fn(),
  countInvoicesForOrganizationMock: vi.fn().mockResolvedValue(0),
  findInvoiceByIdempotencyKeyMock: vi.fn(),
}));

vi.mock("@/lib/core/customers/customer.repository", () => ({ getCustomerById: vi.fn().mockResolvedValue({ id: "cust-1" }) }));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})) },
}));

vi.mock("../invoice.repository", async () => {
  const actual = await vi.importActual<typeof import("../invoice.repository")>("../invoice.repository");
  return {
    ...actual,
    createInvoice: createInvoiceMock,
    createInvoiceItems: createInvoiceItemsMock,
    countInvoicesForOrganization: countInvoicesForOrganizationMock,
    findInvoiceByIdempotencyKey: findInvoiceByIdempotencyKeyMock,
  };
});

import { computeRequestHash } from "@/lib/core/shared/idempotency";
import { createNewInvoice } from "../invoice.service";

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.8.0" });
}

describe("createNewInvoice — manual invoice line authority (Phase 7 final review)", () => {
  beforeEach(() => {
    createInvoiceMock.mockReset().mockImplementation((data: Record<string, unknown>) => Promise.resolve({ id: "invoice-1", ...data }));
    createInvoiceItemsMock.mockReset();
    countInvoicesForOrganizationMock.mockReset().mockResolvedValue(0);
    findInvoiceByIdempotencyKeyMock.mockReset();
  });

  it("materializes exactly one deterministic InvoiceItem mirroring the header amount/taxAmount/totalAmount", async () => {
    await createNewInvoice({ organizationId: "org-1", customerId: "cust-1", title: "Danışmanlık hizmeti", amount: 100, taxRate: 20 });

    expect(createInvoiceItemsMock).toHaveBeenCalledTimes(1);
    const [, , items] = createInvoiceItemsMock.mock.calls[0]!;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ quantity: 1, unitPriceCents: BigInt(10000), vatRateBasisPoints: 2000, lineTotalCents: BigInt(12000) });
  });

  it("never fabricates a productServiceId or orderItemId", async () => {
    await createNewInvoice({ organizationId: "org-1", customerId: "cust-1", title: "Danışmanlık hizmeti", amount: 100, taxRate: 20 });

    const [, , items] = createInvoiceItemsMock.mock.calls[0]!;
    expect(items[0].orderItemId).toBeUndefined();
    expect(items[0].productServiceId).toBeUndefined();
  });

  it("reuses the invoice's own title as the line name — no invented product description", async () => {
    await createNewInvoice({ organizationId: "org-1", customerId: "cust-1", title: "Özel proje danışmanlığı", amount: 250, taxRate: 10 });

    const [, , items] = createInvoiceItemsMock.mock.calls[0]!;
    expect(items[0].name).toBe("Özel proje danışmanlığı");
  });

  it("the mirrored line is a deterministic projection of the header, not an independent computation — same amount/taxRate always yields the same line", async () => {
    await createNewInvoice({ organizationId: "org-1", customerId: "cust-1", title: "A", amount: 33.33, taxRate: 15 });
    const firstItems = createInvoiceItemsMock.mock.calls[0]![2];

    createInvoiceItemsMock.mockClear();
    await createNewInvoice({ organizationId: "org-1", customerId: "cust-1", title: "A", amount: 33.33, taxRate: 15 });
    const secondItems = createInvoiceItemsMock.mock.calls[0]![2];

    expect(firstItems).toEqual(secondItems);
    // And the mirrored line always reconstructs back to exactly the header
    // totals it was derived from (amount=33.33, tax=5.00, total=38.33) —
    // proving the header remains authoritative and the line cannot diverge.
    const item = firstItems[0];
    expect(Number(item.unitPriceCents)).toBe(3333);
    expect(Number(item.lineTotalCents)).toBe(3833);
  });

  it("idempotent replay does not create a second InvoiceItem for the same request", async () => {
    createInvoiceMock.mockRejectedValueOnce(p2002());
    const matchingHash = computeRequestHash({ customerId: "cust-1", quoteId: null, title: "A", amount: 100, taxRate: 20, currency: "TRY", dueDate: null, notes: null });
    findInvoiceByIdempotencyKeyMock.mockResolvedValue({ id: "invoice-1", requestHash: matchingHash });

    const result = await createNewInvoice({ organizationId: "org-1", customerId: "cust-1", title: "A", amount: 100, idempotencyKey: "key-1" });

    expect(result.created).toBe(false);
    expect(createInvoiceItemsMock).not.toHaveBeenCalled();
  });
});
