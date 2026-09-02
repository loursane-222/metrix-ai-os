import { describe, expect, it, vi, beforeEach } from "vitest";

const { createOrderItemsMock, generateOrderNumberMock, recordStatusTransitionMock, getOrderByIdMock } = vi.hoisted(() => ({
  createOrderItemsMock: vi.fn(),
  generateOrderNumberMock: vi.fn().mockResolvedValue("SIP-0001"),
  recordStatusTransitionMock: vi.fn(),
  getOrderByIdMock: vi.fn().mockResolvedValue({ id: "order-1" }),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(currentTx)) },
}));

vi.mock("../order.repository", async () => {
  const actual = await vi.importActual<typeof import("../order.repository")>("../order.repository");
  return {
    ...actual,
    createOrderItems: createOrderItemsMock,
    generateOrderNumber: generateOrderNumberMock,
    recordStatusTransition: recordStatusTransitionMock,
    getOrderById: getOrderByIdMock,
  };
});

import { createOrderFromQuote } from "../order.service";

const quote = {
  id: "quote-1",
  organizationId: "org-1",
  customerId: "cust-1",
  status: "WON",
  currency: "TRY",
  amount: null,
  wonAt: new Date("2026-08-02T00:00:00.000Z"),
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  paymentTermStructured: null,
  generalDiscountBasisPoints: 500,
  deliveryTerm: "EXW",
  deliveryMethod: "CARGO",
  notes: "test notes",
  items: [
    { productServiceId: "prod-1", name: "Item 1", unit: "adet", quantity: 2, unitPriceCents: BigInt(1000), discountBasisPoints: 250, vatRateBasisPoints: 2000, lineTotalCents: BigInt(2000), sortOrder: 0 },
  ],
};

let currentTx: { quote: { findFirst: ReturnType<typeof vi.fn> }; order: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } };

describe("createOrderFromQuote — Phase 6 commercial inheritance", () => {
  beforeEach(() => {
    createOrderItemsMock.mockReset();
    recordStatusTransitionMock.mockReset();
    currentTx = {
      quote: { findFirst: vi.fn().mockResolvedValue(quote) },
      order: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "order-1" }),
      },
    };
  });

  it("snapshots generalDiscountBasisPoints/deliveryTerm/deliveryMethod from the Quote onto the Order", async () => {
    await createOrderFromQuote({ organizationId: "org-1", quoteId: "quote-1" });

    expect(currentTx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generalDiscountBasisPoints: 500,
          deliveryTerm: "EXW",
          deliveryMethod: "CARGO",
        }),
      }),
    );
  });

  it("snapshots discountBasisPoints/vatRateBasisPoints per QuoteItem onto the OrderItem", async () => {
    await createOrderFromQuote({ organizationId: "org-1", quoteId: "quote-1" });

    expect(createOrderItemsMock).toHaveBeenCalledWith(
      "order-1",
      "org-1",
      [expect.objectContaining({ discountBasisPoints: 250, vatRateBasisPoints: 2000 })],
      currentTx,
    );
  });

  it("leaves commercial fields undefined when the Quote never set them (no fabricated values)", async () => {
    currentTx.quote.findFirst.mockResolvedValue({ ...quote, generalDiscountBasisPoints: null, deliveryTerm: null, deliveryMethod: null });

    await createOrderFromQuote({ organizationId: "org-1", quoteId: "quote-1" });

    expect(currentTx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ generalDiscountBasisPoints: undefined, deliveryTerm: undefined, deliveryMethod: undefined }),
      }),
    );
  });
});
