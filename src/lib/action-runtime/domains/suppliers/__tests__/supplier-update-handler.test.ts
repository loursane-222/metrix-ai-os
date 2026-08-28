import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { updateSupplierDetailsMock, getSupplierByIdForOrganizationMock } = vi.hoisted(() => ({
  updateSupplierDetailsMock: vi.fn(),
  getSupplierByIdForOrganizationMock: vi.fn(),
}));
vi.mock("@/lib/core/suppliers/supplier.service", () => ({
  updateSupplierDetails: updateSupplierDetailsMock,
  getSupplierByIdForOrganization: getSupplierByIdForOrganizationMock,
}));

import { handleSupplierUpdate } from "../supplier-update-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "supplier.update",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["suppliers.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleSupplierUpdate", () => {
  beforeEach(() => {
    updateSupplierDetailsMock.mockReset();
    getSupplierByIdForOrganizationMock.mockReset();
  });

  it("builds a compensationSnapshot that reverse-patches only the changed fields", async () => {
    getSupplierByIdForOrganizationMock.mockResolvedValue({ id: "s1", displayName: "Eski İsim", phone: "0000" });
    updateSupplierDetailsMock.mockResolvedValue({ id: "s1", displayName: "Yeni İsim" });

    const result = await handleSupplierUpdate(envelope({ id: "s1", patch: { displayName: "Yeni İsim" } }));

    expect(result.compensationSnapshot).toEqual({ id: "s1", patch: { displayName: "Eski İsim" } });
  });

  it("rejects an update for an unknown supplier before mutation", async () => {
    getSupplierByIdForOrganizationMock.mockResolvedValue(null);
    await expect(handleSupplierUpdate(envelope({ id: "missing", patch: { displayName: "X" } }))).rejects.toThrow(/not found/);
    expect(updateSupplierDetailsMock).not.toHaveBeenCalled();
  });
});
