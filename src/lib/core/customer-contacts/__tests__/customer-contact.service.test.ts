import { describe, expect, it, vi, beforeEach } from "vitest";

const { createPrimaryContactMock, findPrimaryContactMock, findPrimaryContactsForCustomersMock, updateContactMock } =
  vi.hoisted(() => ({
    createPrimaryContactMock: vi.fn(),
    findPrimaryContactMock: vi.fn(),
    findPrimaryContactsForCustomersMock: vi.fn(),
    updateContactMock: vi.fn(),
  }));

vi.mock("../customer-contact.repository", () => ({
  createPrimaryContact: createPrimaryContactMock,
  findPrimaryContact: findPrimaryContactMock,
  findPrimaryContactsForCustomers: findPrimaryContactsForCustomersMock,
  updateContact: updateContactMock,
}));

import { getPrimaryContactsByCustomerId, upsertPrimaryContactForCustomer } from "../customer-contact.service";

describe("upsertPrimaryContactForCustomer", () => {
  beforeEach(() => {
    createPrimaryContactMock.mockReset();
    findPrimaryContactMock.mockReset();
    updateContactMock.mockReset();
  });

  it("returns null and creates nothing when no contact field is provided", async () => {
    const result = await upsertPrimaryContactForCustomer({
      organizationId: "org-1",
      customerId: "cust-1",
    });

    expect(result).toBeNull();
    expect(findPrimaryContactMock).not.toHaveBeenCalled();
    expect(createPrimaryContactMock).not.toHaveBeenCalled();
  });

  it("creates a new primary contact when none exists yet", async () => {
    findPrimaryContactMock.mockResolvedValue(null);
    createPrimaryContactMock.mockResolvedValue({ id: "contact-1", isPrimary: true });

    const result = await upsertPrimaryContactForCustomer({
      organizationId: "org-1",
      customerId: "cust-1",
      fullName: "Ahmet Yilmaz",
    });

    expect(createPrimaryContactMock).toHaveBeenCalledTimes(1);
    expect(updateContactMock).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "contact-1", isPrimary: true });
  });

  it("updates the existing primary contact instead of creating a duplicate", async () => {
    findPrimaryContactMock
      .mockResolvedValueOnce({ id: "contact-1", isPrimary: true, fullName: "Old Name" })
      .mockResolvedValueOnce({ id: "contact-1", isPrimary: true, fullName: "Ahmet Yilmaz" });

    const result = await upsertPrimaryContactForCustomer({
      organizationId: "org-1",
      customerId: "cust-1",
      fullName: "Ahmet Yilmaz",
    });

    expect(createPrimaryContactMock).not.toHaveBeenCalled();
    expect(updateContactMock).toHaveBeenCalledWith(
      "contact-1",
      "org-1",
      expect.objectContaining({ fullName: "Ahmet Yilmaz" }),
      undefined,
    );
    expect(result?.fullName).toBe("Ahmet Yilmaz");
  });
});

describe("getPrimaryContactsByCustomerId", () => {
  it("returns an empty map when there are no customer ids", async () => {
    const result = await getPrimaryContactsByCustomerId("org-1", []);
    expect(result.size).toBe(0);
    expect(findPrimaryContactsForCustomersMock).not.toHaveBeenCalled();
  });

  it("indexes contacts by customerId", async () => {
    findPrimaryContactsForCustomersMock.mockResolvedValue([
      { id: "contact-1", customerId: "cust-1" },
      { id: "contact-2", customerId: "cust-2" },
    ]);

    const result = await getPrimaryContactsByCustomerId("org-1", ["cust-1", "cust-2"]);

    expect(result.get("cust-1")).toEqual({ id: "contact-1", customerId: "cust-1" });
    expect(result.get("cust-2")).toEqual({ id: "contact-2", customerId: "cust-2" });
  });
});
