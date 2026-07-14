import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  createQuoteMock,
  findByIdForOrganizationMock,
  listByOrganizationMock,
  getCustomerByIdMock,
  isPersonLinkedToCustomerMock,
  findPersonByIdMock,
  logQuoteCreatedMock,
} = vi.hoisted(() => ({
  createQuoteMock: vi.fn(),
  findByIdForOrganizationMock: vi.fn(),
  listByOrganizationMock: vi.fn(),
  getCustomerByIdMock: vi.fn(),
  isPersonLinkedToCustomerMock: vi.fn(),
  findPersonByIdMock: vi.fn(),
  logQuoteCreatedMock: vi.fn(),
}));

vi.mock("../quote.repository", () => ({
  createQuote: createQuoteMock,
  findByIdForOrganization: findByIdForOrganizationMock,
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

import { createNewQuote } from "../quote.service";

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

describe("createNewQuote", () => {
  beforeEach(() => {
    createQuoteMock.mockReset();
    getCustomerByIdMock.mockReset();
    isPersonLinkedToCustomerMock.mockReset();
    findPersonByIdMock.mockReset();
    logQuoteCreatedMock.mockReset();
    createQuoteMock.mockResolvedValue({ id: "quote-1" });
  });

  it("creates a Quote with customerId and derives customerName from Customer.displayName", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());

    await createNewQuote({
      organizationId: ORG_A,
      customerId: "customer-1",
      title: "Yıllık bakım teklifi",
      amount: 50_000,
    });

    expect(getCustomerByIdMock).toHaveBeenCalledWith("customer-1", ORG_A);
    expect(createQuoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG_A,
        customerId: "customer-1",
        customerName: "Zensoft Teknoloji A.Ş.",
        personId: null,
      }),
    );
    expect(logQuoteCreatedMock).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: "quote-1", source: "USER_CREATED" }),
    );
  });

  it("rejects a customerId belonging to another tenant", async () => {
    // getCustomerById is tenant-scoped in the repository; a cross-tenant id resolves to null.
    getCustomerByIdMock.mockResolvedValue(null);

    await expect(
      createNewQuote({
        organizationId: ORG_B,
        customerId: "customer-1",
        title: "Yıllık bakım teklifi",
      }),
    ).rejects.toMatchObject({ message: "Customer not found.", status: 404 });

    expect(createQuoteMock).not.toHaveBeenCalled();
  });

  it("accepts an optional personId when linked to the selected customer via CustomerContact", async () => {
    getCustomerByIdMock.mockResolvedValue(buildCustomer());
    findPersonByIdMock.mockResolvedValue({ id: "person-1", organizationId: ORG_A });
    isPersonLinkedToCustomerMock.mockResolvedValue(true);

    await createNewQuote({
      organizationId: ORG_A,
      customerId: "customer-1",
      personId: "person-1",
      title: "Yıllık bakım teklifi",
    });

    expect(createQuoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ personId: "person-1" }),
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

    await createNewQuote({
      organizationId: ORG_A,
      customerId: "customer-1",
      title: "Yıllık bakım teklifi",
    });

    expect(findPersonByIdMock).not.toHaveBeenCalled();
    expect(createQuoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ personId: null }),
    );
  });
});
