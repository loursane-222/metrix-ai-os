import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { unarchiveCustomerByIdMock, getCustomerByIdForOrganizationMock } = vi.hoisted(() => ({
  unarchiveCustomerByIdMock: vi.fn(),
  getCustomerByIdForOrganizationMock: vi.fn(),
}));
vi.mock("@/lib/core/customers/customer.service", () => ({
  unarchiveCustomerById: unarchiveCustomerByIdMock,
  getCustomerByIdForOrganization: getCustomerByIdForOrganizationMock,
}));

import { customerUnarchiveHandler } from "../customer-unarchive-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "customer.unarchive",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["customers.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("customerUnarchiveHandler", () => {
  beforeEach(() => {
    unarchiveCustomerByIdMock.mockReset();
    getCustomerByIdForOrganizationMock.mockReset();
  });

  it("reactivates the addressed customer through the canonical service", async () => {
    getCustomerByIdForOrganizationMock.mockResolvedValue({ id: "c1", status: "PASSIVE" });
    unarchiveCustomerByIdMock.mockResolvedValue(undefined);

    const result = await customerUnarchiveHandler(envelope({ customerId: "c1" }));

    expect(unarchiveCustomerByIdMock).toHaveBeenCalledWith("c1", "org-1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "customer", entityId: "c1" } });
  });

  it("reports NO_CHANGE without a second mutation when already active", async () => {
    getCustomerByIdForOrganizationMock.mockResolvedValue({ id: "c1", status: "ACTIVE" });

    const result = await customerUnarchiveHandler(envelope({ customerId: "c1" }));

    expect(unarchiveCustomerByIdMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE" });
  });

  it("rejects a missing customerId before mutation", async () => {
    await expect(customerUnarchiveHandler(envelope({}))).rejects.toThrow(/customerId/);
    expect(unarchiveCustomerByIdMock).not.toHaveBeenCalled();
  });
});
