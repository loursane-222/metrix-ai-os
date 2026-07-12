import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApiValidationError } from "@/lib/api/validation";

const { createCustomerMock, findCustomerByIdentityMock } = vi.hoisted(() => ({
  createCustomerMock: vi.fn(),
  findCustomerByIdentityMock: vi.fn(),
}));

vi.mock("../customer.repository", () => ({
  createCustomer: createCustomerMock,
  findCustomerByIdentity: findCustomerByIdentityMock,
  getCustomerById: vi.fn(),
  listCustomersForOrganization: vi.fn(),
  updateCustomer: vi.fn(),
  archiveCustomer: vi.fn(),
}));

import { createNewCustomer } from "../customer.service";

describe("createNewCustomer", () => {
  beforeEach(() => {
    createCustomerMock.mockReset();
    findCustomerByIdentityMock.mockReset();
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

    expect(findCustomerByIdentityMock).toHaveBeenCalledWith("org-1", "Acme Ltd", undefined, undefined);
    expect(createCustomerMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: "new-1", displayName: "Acme Ltd" });
  });
});
