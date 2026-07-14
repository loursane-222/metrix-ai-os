import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApiValidationError } from "@/lib/api/validation";

const { createCustomerMock, findCustomerByIdentityMock } = vi.hoisted(() => ({
  createCustomerMock: vi.fn(),
  findCustomerByIdentityMock: vi.fn(),
}));

const { upsertPrimaryContactForCustomerMock } = vi.hoisted(() => ({
  upsertPrimaryContactForCustomerMock: vi.fn(),
}));

vi.mock("../customer.repository", () => ({
  createCustomer: createCustomerMock,
  findCustomerByIdentity: findCustomerByIdentityMock,
  getCustomerById: vi.fn(),
  listCustomersForOrganization: vi.fn(),
  updateCustomer: vi.fn(),
  archiveCustomer: vi.fn(),
}));

vi.mock("@/lib/core/customer-contacts/customer-contact.service", () => ({
  upsertPrimaryContactForCustomer: upsertPrimaryContactForCustomerMock,
  getPrimaryContactForCustomer: vi.fn().mockResolvedValue(null),
  getPrimaryContactsByCustomerId: vi.fn().mockResolvedValue(new Map()),
}));

// createNewCustomer runs inside prisma.$transaction; the real client requires
// DATABASE_URL to construct, so the transaction is faked to just invoke the
// callback with a stub transaction handle. Repository calls inside it are
// already mocked above, so the stub handle is never actually used.
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

import { createNewCustomer } from "../customer.service";

describe("createNewCustomer", () => {
  beforeEach(() => {
    createCustomerMock.mockReset();
    findCustomerByIdentityMock.mockReset();
    upsertPrimaryContactForCustomerMock.mockReset();
    upsertPrimaryContactForCustomerMock.mockResolvedValue(null);
  });

  it("rejects creation when a customer with the same identity already exists", async () => {
    findCustomerByIdentityMock.mockResolvedValue({
      id: "existing-1",
      displayName: "Acme Ltd",
    });

    await expect(
      createNewCustomer({
        organizationId: "org-1",
        displayName: "Acme Ltd.",
      }),
    ).rejects.toThrow(ApiValidationError);

    expect(createCustomerMock).not.toHaveBeenCalled();
  });

  it("creates the customer when no matching identity is found", async () => {
    findCustomerByIdentityMock.mockResolvedValue(null);
    createCustomerMock.mockResolvedValue({ id: "new-1", displayName: "Acme Ltd" });

    const result = await createNewCustomer({
      organizationId: "org-1",
      displayName: "Acme Ltd",
    });

    expect(findCustomerByIdentityMock).toHaveBeenCalledWith(
      "org-1",
      "Acme Ltd",
      undefined,
      undefined,
      undefined,
      { cariKodu: undefined, taxNumber: undefined },
    );
    expect(createCustomerMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: "new-1", displayName: "Acme Ltd", primaryContact: null });
  });

  it("checks identity against cariKodu/taxNumber in addition to name/phone/email", async () => {
    findCustomerByIdentityMock.mockResolvedValue(null);
    createCustomerMock.mockResolvedValue({ id: "new-2", displayName: "Zensoft" });

    await createNewCustomer({
      organizationId: "org-1",
      displayName: "Zensoft",
      cariKodu: "C-000245",
      taxNumber: "1234567890",
    });

    expect(findCustomerByIdentityMock).toHaveBeenCalledWith(
      "org-1",
      "Zensoft",
      undefined,
      undefined,
      undefined,
      { cariKodu: "C-000245", taxNumber: "1234567890" },
    );
  });

  it("creates a primary contact when contact details are provided", async () => {
    findCustomerByIdentityMock.mockResolvedValue(null);
    createCustomerMock.mockResolvedValue({ id: "new-3", displayName: "Nova A.S." });
    upsertPrimaryContactForCustomerMock.mockResolvedValue({
      id: "contact-1",
      customerId: "new-3",
      fullName: "Ahmet Yilmaz",
      isPrimary: true,
    });

    const result = await createNewCustomer({
      organizationId: "org-1",
      displayName: "Nova A.S.",
      primaryContact: { fullName: "Ahmet Yilmaz", phone: "+905321234567" },
    });

    expect(upsertPrimaryContactForCustomerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        customerId: "new-3",
        fullName: "Ahmet Yilmaz",
        phone: "+905321234567",
      }),
      expect.anything(),
    );
    expect(result.primaryContact).toEqual(
      expect.objectContaining({ id: "contact-1", fullName: "Ahmet Yilmaz" }),
    );
  });

  it("passes an empty contact payload through when no primary contact is provided", async () => {
    findCustomerByIdentityMock.mockResolvedValue(null);
    createCustomerMock.mockResolvedValue({ id: "new-4", displayName: "Aksa" });

    await createNewCustomer({
      organizationId: "org-1",
      displayName: "Aksa",
    });

    expect(upsertPrimaryContactForCustomerMock).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: undefined, phone: undefined, email: undefined, title: undefined }),
      expect.anything(),
    );
  });
});
