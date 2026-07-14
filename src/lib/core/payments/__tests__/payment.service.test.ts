import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const {
  createPaymentMock,
  findByIdempotencyKeyMock,
  getCustomerByIdMock,
  isPersonLinkedToCustomerMock,
  findPersonByIdMock,
  findQuoteByIdForOrganizationMock,
} = vi.hoisted(() => ({
  createPaymentMock: vi.fn(),
  findByIdempotencyKeyMock: vi.fn(),
  getCustomerByIdMock: vi.fn(),
  isPersonLinkedToCustomerMock: vi.fn(),
  findPersonByIdMock: vi.fn(),
  findQuoteByIdForOrganizationMock: vi.fn(),
}));

vi.mock("../payment.repository", () => ({
  createPayment: createPaymentMock,
  findByIdempotencyKey: findByIdempotencyKeyMock,
}));

vi.mock("@/lib/core/customers/customer.repository", () => ({
  getCustomerById: getCustomerByIdMock,
}));

vi.mock("@/lib/core/customer-contacts/customer-contact.service", () => ({
  isPersonLinkedToCustomer: isPersonLinkedToCustomerMock,
}));

vi.mock("@/lib/core/people/person.repository", () => ({
  findPersonById: findPersonByIdMock,
}));

vi.mock("@/lib/core/quotes/quote.service", () => ({
  findQuoteByIdForOrganization: findQuoteByIdForOrganizationMock,
}));

import { createNewPayment } from "../payment.service";

const ORG_A = "org-a";
const ORG_B = "org-b";

function buildCustomer(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "customer-1",
    organizationId: ORG_A,
    displayName: "Zensoft Teknoloji A.Ş.",
    ...overrides,
  };
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.8.0",
  });
}

describe("createNewPayment", () => {
  beforeEach(() => {
    createPaymentMock.mockReset();
    findByIdempotencyKeyMock.mockReset();
    getCustomerByIdMock.mockReset();
    isPersonLinkedToCustomerMock.mockReset();
    findPersonByIdMock.mockReset();
    findQuoteByIdForOrganizationMock.mockReset();
    createPaymentMock.mockImplementation(async (input) => ({ id: "payment-1", requestHash: null, ...input }));
  });

  it("creates a Payment and writes customerId", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());

    const outcome = await createNewPayment({
      organizationId: ORG_A,
      customerId: "customer-1",
      title: "Kasım tahsilatı",
      amount: 10_000,
    });

    expect(outcome.created).toBe(true);
    expect(getCustomerByIdMock).toHaveBeenCalledWith("customer-1", ORG_A);
    expect(createPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_A, customerId: "customer-1", personId: null, quoteId: null }),
    );
    expect(outcome.payment.customerId).toBe("customer-1");
  });

  it("rejects a customerId belonging to another tenant", async () => {
    getCustomerByIdMock.mockResolvedValue(null);

    await expect(
      createNewPayment({ organizationId: ORG_B, customerId: "customer-1", title: "Kasım tahsilatı", amount: 10_000 }),
    ).rejects.toMatchObject({ message: "Customer not found.", status: 404 });

    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it("rejects a customerId/personId mismatch", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());
    findPersonByIdMock.mockResolvedValue({ id: "person-1", organizationId: ORG_A });
    isPersonLinkedToCustomerMock.mockResolvedValue(false);

    await expect(
      createNewPayment({
        organizationId: ORG_A,
        customerId: "customer-1",
        personId: "person-1",
        title: "Kasım tahsilatı",
        amount: 10_000,
      }),
    ).rejects.toMatchObject({ message: "Person is not linked to this customer.", status: 409 });

    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it("accepts a quoteId that belongs to the same customer", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());
    findQuoteByIdForOrganizationMock.mockResolvedValue({ id: "quote-1", customerId: "customer-1" });

    await createNewPayment({
      organizationId: ORG_A,
      customerId: "customer-1",
      quoteId: "quote-1",
      title: "Kasım tahsilatı",
      amount: 10_000,
    });

    expect(createPaymentMock).toHaveBeenCalledWith(expect.objectContaining({ quoteId: "quote-1" }));
  });

  it("rejects a quoteId belonging to a different customer or tenant", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());
    findQuoteByIdForOrganizationMock.mockResolvedValue({ id: "quote-1", customerId: "customer-2" });

    await expect(
      createNewPayment({
        organizationId: ORG_A,
        customerId: "customer-1",
        quoteId: "quote-1",
        title: "Kasım tahsilatı",
        amount: 10_000,
      }),
    ).rejects.toMatchObject({ message: "Quote belongs to a different customer.", status: 409 });

    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it("creates the Payment with only customerId when the contact has no linked personId", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());

    const outcome = await createNewPayment({
      organizationId: ORG_A,
      customerId: "customer-1",
      title: "Kasım tahsilatı",
      amount: 10_000,
    });

    expect(findPersonByIdMock).not.toHaveBeenCalled();
    expect(outcome.payment.personId).toBeNull();
  });

  describe("idempotency", () => {
    it("behaves like the legacy path when no Idempotency-Key is sent", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());

      const outcome = await createNewPayment({
        organizationId: ORG_A,
        customerId: "customer-1",
        title: "Kasım tahsilatı",
        amount: 10_000,
      });

      expect(outcome.created).toBe(true);
      expect(findByIdempotencyKeyMock).not.toHaveBeenCalled();
      expect(createPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: null, requestHash: null }),
      );
    });

    it("creates a new Payment on the first request carrying a key", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());

      const outcome = await createNewPayment({
        organizationId: ORG_A,
        customerId: "customer-1",
        title: "Kasım tahsilatı",
        amount: 10_000,
        idempotencyKey: "payment-key-1",
      });

      expect(outcome.created).toBe(true);
      expect(createPaymentMock).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: "payment-key-1", requestHash: expect.any(String) }),
      );
    });

    it("returns the existing Payment on same key + same payload replay, without a second Payment", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());

      const args = {
        organizationId: ORG_A,
        customerId: "customer-1",
        title: "Kasım tahsilatı",
        amount: 10_000,
        idempotencyKey: "payment-key-1",
      };

      const first = await createNewPayment(args);
      const storedHash = createPaymentMock.mock.calls[0][0].requestHash;

      createPaymentMock.mockRejectedValueOnce(p2002());
      findByIdempotencyKeyMock.mockResolvedValue({ id: "payment-1", requestHash: storedHash });

      const replay = await createNewPayment(args);

      expect(first.created).toBe(true);
      expect(replay.created).toBe(false);
      expect(replay.payment.id).toBe("payment-1");
      expect(createPaymentMock).toHaveBeenCalledTimes(2); // 1 real insert + 1 rejected attempt, never a second row
    });

    it("rejects same key + different payload with a 409", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());
      createPaymentMock.mockRejectedValueOnce(p2002());
      findByIdempotencyKeyMock.mockResolvedValue({ id: "payment-1", requestHash: "a-different-hash" });

      await expect(
        createNewPayment({
          organizationId: ORG_A,
          customerId: "customer-1",
          title: "Kasım tahsilatı",
          amount: 10_000,
          idempotencyKey: "payment-key-1",
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("propagates a non-P2002 error untouched", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());
      createPaymentMock.mockRejectedValueOnce(new Error("connection lost"));

      await expect(
        createNewPayment({
          organizationId: ORG_A,
          customerId: "customer-1",
          title: "Kasım tahsilatı",
          amount: 10_000,
          idempotencyKey: "payment-key-1",
        }),
      ).rejects.toThrow("connection lost");

      expect(findByIdempotencyKeyMock).not.toHaveBeenCalled();
    });

    it("lets different tenants reuse the same key independently", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());

      const outcomeA = await createNewPayment({
        organizationId: ORG_A,
        customerId: "customer-1",
        title: "Kasım tahsilatı",
        amount: 10_000,
        idempotencyKey: "shared-key",
      });

      getCustomerByIdMock.mockResolvedValue(buildCustomer({ organizationId: ORG_B }));

      const outcomeB = await createNewPayment({
        organizationId: ORG_B,
        customerId: "customer-1",
        title: "Kasım tahsilatı",
        amount: 10_000,
        idempotencyKey: "shared-key",
      });

      expect(outcomeA.created).toBe(true);
      expect(outcomeB.created).toBe(true);
      expect(createPaymentMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ organizationId: ORG_A }));
      expect(createPaymentMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ organizationId: ORG_B }));
    });
  });
});
