import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const {
  createQuoteMock,
  findByIdForOrganizationMock,
  findByIdempotencyKeyMock,
  listByOrganizationMock,
  getCustomerByIdMock,
  isPersonLinkedToCustomerMock,
  findPersonByIdMock,
  logQuoteCreatedMock,
  transactionMock,
} = vi.hoisted(() => ({
  createQuoteMock: vi.fn(),
  findByIdForOrganizationMock: vi.fn(),
  findByIdempotencyKeyMock: vi.fn(),
  listByOrganizationMock: vi.fn(),
  getCustomerByIdMock: vi.fn(),
  isPersonLinkedToCustomerMock: vi.fn(),
  findPersonByIdMock: vi.fn(),
  logQuoteCreatedMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock("../quote.repository", () => ({
  createQuote: createQuoteMock,
  findByIdForOrganization: findByIdForOrganizationMock,
  findByIdempotencyKey: findByIdempotencyKeyMock,
  listByOrganization: listByOrganizationMock,
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

vi.mock("../quote-event.service", () => ({
  logQuoteCreated: logQuoteCreatedMock,
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: transactionMock },
}));

import { createNewQuote } from "../quote.service";

const ORG_A = "org-a";
const ORG_B = "org-b";
const FAKE_TX = { __tx: true };

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

describe("createNewQuote", () => {
  beforeEach(() => {
    createQuoteMock.mockReset();
    findByIdempotencyKeyMock.mockReset();
    getCustomerByIdMock.mockReset();
    isPersonLinkedToCustomerMock.mockReset();
    findPersonByIdMock.mockReset();
    logQuoteCreatedMock.mockReset();
    transactionMock.mockReset();

    // Mirrors prisma.$transaction: run the callback with a shared fake tx handle.
    transactionMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(FAKE_TX));
    createQuoteMock.mockResolvedValue({ id: "quote-1", requestHash: null });
    logQuoteCreatedMock.mockResolvedValue(undefined);
  });

  it("creates a Quote with customerId and derives customerName from Customer.displayName", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());

    const outcome = await createNewQuote({
      organizationId: ORG_A,
      customerId: "customer-1",
      title: "Yıllık bakım teklifi",
      amount: 50_000,
    });

    expect(outcome.created).toBe(true);
    expect(getCustomerByIdMock).toHaveBeenCalledWith("customer-1", ORG_A);
    expect(createQuoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        customerId: "customer-1",
        customerName: "Zensoft Teknoloji A.Ş.",
        personId: null,
      }),
      FAKE_TX,
    );
    expect(logQuoteCreatedMock).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: "quote-1", source: "USER_CREATED" }),
      FAKE_TX,
    );
  });

  it("rejects a customerId belonging to another tenant", async () => {
    getCustomerByIdMock.mockResolvedValue(null);

    await expect(
      createNewQuote({ organizationId: ORG_B, customerId: "customer-1", title: "Yıllık bakım teklifi" }),
    ).rejects.toMatchObject({ message: "Customer not found.", status: 404 });

    expect(createQuoteMock).not.toHaveBeenCalled();
  });

  it("accepts an optional personId when linked to the selected customer via CustomerContact", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());
    findPersonByIdMock.mockResolvedValue({ id: "person-1", organizationId: ORG_A });
    isPersonLinkedToCustomerMock.mockResolvedValue(true);

    const outcome = await createNewQuote({
      organizationId: ORG_A,
      customerId: "customer-1",
      personId: "person-1",
      title: "Yıllık bakım teklifi",
    });

    expect(outcome.created).toBe(true);
    expect(createQuoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ personId: "person-1" }),
      FAKE_TX,
    );
  });

  it("rejects a personId that is linked to a different customer", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());
    findPersonByIdMock.mockResolvedValue({ id: "person-1", organizationId: ORG_A });
    isPersonLinkedToCustomerMock.mockResolvedValue(false);

    await expect(
      createNewQuote({
        organizationId: ORG_A,
        customerId: "customer-1",
        personId: "person-1",
        title: "Yıllık bakım teklifi",
      }),
    ).rejects.toMatchObject({ message: "Person is not linked to this customer.", status: 409 });

    expect(createQuoteMock).not.toHaveBeenCalled();
  });

  it("creates the Quote with only customerId when no contact/personId is provided", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());

    const outcome = await createNewQuote({
      organizationId: ORG_A,
      customerId: "customer-1",
      title: "Yıllık bakım teklifi",
    });

    expect(findPersonByIdMock).not.toHaveBeenCalled();
    expect(outcome.quote.id).toBe("quote-1");
  });

  describe("idempotency", () => {
    it("behaves like the legacy path when no Idempotency-Key is sent", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());

      const outcome = await createNewQuote({
        organizationId: ORG_A,
        customerId: "customer-1",
        title: "Yıllık bakım teklifi",
      });

      expect(outcome.created).toBe(true);
      expect(findByIdempotencyKeyMock).not.toHaveBeenCalled();
      expect(createQuoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: null, requestHash: null }),
        FAKE_TX,
      );
    });

    it("creates a new Quote on the first request carrying a key", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());

      const outcome = await createNewQuote({
        organizationId: ORG_A,
        customerId: "customer-1",
        title: "Yıllık bakım teklifi",
        amount: 50_000,
        idempotencyKey: "quote-key-1",
      });

      expect(outcome.created).toBe(true);
      expect(createQuoteMock).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: "quote-key-1", requestHash: expect.any(String) }),
        FAKE_TX,
      );
    });

    it("returns the existing Quote (200-equivalent outcome) on same key + same payload replay", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());

      const args = {
        organizationId: ORG_A,
        customerId: "customer-1",
        title: "Yıllık bakım teklifi",
        amount: 50_000,
        idempotencyKey: "quote-key-1",
      };

      // Compute the same hash the service would, by running the happy path once.
      createQuoteMock.mockResolvedValueOnce({ id: "quote-1", requestHash: null });
      const first = await createNewQuote(args);
      const storedHash = createQuoteMock.mock.calls[0][0].requestHash;

      createQuoteMock.mockRejectedValueOnce(p2002());
      findByIdempotencyKeyMock.mockResolvedValue({ id: "quote-1", requestHash: storedHash });

      const replay = await createNewQuote(args);

      expect(first.created).toBe(true);
      expect(replay.created).toBe(false);
      expect(replay.quote.id).toBe("quote-1");
      expect(logQuoteCreatedMock).toHaveBeenCalledTimes(1); // not called again on replay
    });

    it("rejects same key + different payload with a 409", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());
      createQuoteMock.mockRejectedValueOnce(p2002());
      findByIdempotencyKeyMock.mockResolvedValue({ id: "quote-1", requestHash: "a-different-hash" });

      await expect(
        createNewQuote({
          organizationId: ORG_A,
          customerId: "customer-1",
          title: "Yıllık bakım teklifi",
          amount: 50_000,
          idempotencyKey: "quote-key-1",
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("propagates a non-P2002 error untouched", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());
      createQuoteMock.mockRejectedValueOnce(new Error("connection lost"));

      await expect(
        createNewQuote({
          organizationId: ORG_A,
          customerId: "customer-1",
          title: "Yıllık bakım teklifi",
          idempotencyKey: "quote-key-1",
        }),
      ).rejects.toThrow("connection lost");

      expect(findByIdempotencyKeyMock).not.toHaveBeenCalled();
    });

    it("throws a controlled error if the conflicting row can't be found on replay", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());
      createQuoteMock.mockRejectedValueOnce(p2002());
      findByIdempotencyKeyMock.mockResolvedValue(null);

      await expect(
        createNewQuote({
          organizationId: ORG_A,
          customerId: "customer-1",
          title: "Yıllık bakım teklifi",
          idempotencyKey: "quote-key-1",
        }),
      ).rejects.toMatchObject({ status: 500 });
    });

    it("lets different tenants reuse the same key independently", async () => {
      getCustomerByIdMock.mockResolvedValue(buildCustomer());

      const outcomeA = await createNewQuote({
        organizationId: ORG_A,
        customerId: "customer-1",
        title: "Yıllık bakım teklifi",
        idempotencyKey: "shared-key",
      });

      getCustomerByIdMock.mockResolvedValue(buildCustomer({ organizationId: ORG_B }));
      createQuoteMock.mockResolvedValueOnce({ id: "quote-2", requestHash: null });

      const outcomeB = await createNewQuote({
        organizationId: ORG_B,
        customerId: "customer-1",
        title: "Yıllık bakım teklifi",
        idempotencyKey: "shared-key",
      });

      expect(outcomeA.created).toBe(true);
      expect(outcomeB.created).toBe(true);
      expect(createQuoteMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ organizationId: ORG_A }), FAKE_TX);
      expect(createQuoteMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ organizationId: ORG_B }), FAKE_TX);
    });
  });
});
