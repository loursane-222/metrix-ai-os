import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  createPaymentMock,
  getCustomerByIdMock,
  isPersonLinkedToCustomerMock,
  findPersonByIdMock,
  findQuoteByIdForOrganizationMock,
} = vi.hoisted(() => ({
  createPaymentMock: vi.fn(),
  getCustomerByIdMock: vi.fn(),
  isPersonLinkedToCustomerMock: vi.fn(),
  findPersonByIdMock: vi.fn(),
  findQuoteByIdForOrganizationMock: vi.fn(),
}));

vi.mock("../payment.repository", () => ({
  createPayment: createPaymentMock,
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

describe("createNewPayment", () => {
  beforeEach(() => {
    createPaymentMock.mockReset();
    getCustomerByIdMock.mockReset();
    isPersonLinkedToCustomerMock.mockReset();
    findPersonByIdMock.mockReset();
    findQuoteByIdForOrganizationMock.mockReset();
    createPaymentMock.mockImplementation(async (input) => ({ id: "payment-1", ...input }));
  });

  it("creates a Payment and writes customerId", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());

    const payment = await createNewPayment({
      organizationId: ORG_A,
      customerId: "customer-1",
      title: "Kasım tahsilatı",
      amount: 10_000,
    });

    expect(getCustomerByIdMock).toHaveBeenCalledWith("customer-1", ORG_A);
    expect(createPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_A, customerId: "customer-1", personId: null, quoteId: null }),
    );
    expect(payment.customerId).toBe("customer-1");
  });

  it("rejects a customerId belonging to another tenant", async () => {
    getCustomerByIdMock.mockResolvedValue(null);

    await expect(
      createNewPayment({
        organizationId: ORG_B,
        customerId: "customer-1",
        title: "Kasım tahsilatı",
        amount: 10_000,
      }),
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

    expect(createPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: "quote-1" }),
    );
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

    await createNewPayment({
      organizationId: ORG_A,
      customerId: "customer-1",
      title: "Kasım tahsilatı",
      amount: 10_000,
    });

    expect(findPersonByIdMock).not.toHaveBeenCalled();
    expect(createPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({ personId: null }),
    );
  });
});
