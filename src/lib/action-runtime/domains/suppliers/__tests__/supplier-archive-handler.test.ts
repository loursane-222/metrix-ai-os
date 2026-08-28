import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { archiveSupplierByIdMock, getSupplierByIdForOrganizationMock } = vi.hoisted(() => ({ archiveSupplierByIdMock: vi.fn(), getSupplierByIdForOrganizationMock: vi.fn() }));
vi.mock("@/lib/core/suppliers/supplier.service", () => ({ archiveSupplierById: archiveSupplierByIdMock, getSupplierByIdForOrganization: getSupplierByIdForOrganizationMock }));

import { handleSupplierArchive } from "../supplier-archive-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "supplier.archive",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["suppliers.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleSupplierArchive", () => {
  beforeEach(() => {
    archiveSupplierByIdMock.mockReset();
    getSupplierByIdForOrganizationMock.mockReset().mockResolvedValue({ id: "sup-1", displayName: "Atlas Metal" });
  });

  it("archives the addressed supplier through the canonical service", async () => {
    archiveSupplierByIdMock.mockResolvedValue(undefined);

    const result = await handleSupplierArchive(envelope({ supplierId: "sup-1" }));

    expect(archiveSupplierByIdMock).toHaveBeenCalledWith("sup-1", "org-1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "supplier", entityId: "sup-1" } });
  });

  it("rejects a missing supplierId before mutation", async () => {
    await expect(handleSupplierArchive(envelope({}))).rejects.toThrow(/supplierId/);
    expect(archiveSupplierByIdMock).not.toHaveBeenCalled();
  });
});
