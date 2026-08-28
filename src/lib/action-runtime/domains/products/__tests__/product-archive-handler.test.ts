import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/core/notifications", () => ({ notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }) }));

const { archiveProductServiceByIdMock, getProductServiceByIdForOrganizationMock } = vi.hoisted(() => ({
  archiveProductServiceByIdMock: vi.fn(),
  getProductServiceByIdForOrganizationMock: vi.fn(),
}));
vi.mock("@/lib/core/products/product.service", () => ({
  archiveProductServiceById: archiveProductServiceByIdMock,
  getProductServiceByIdForOrganization: getProductServiceByIdForOrganizationMock,
}));

import { productArchiveHandler } from "../product-archive-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "product.archive",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["products.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("productArchiveHandler", () => {
  beforeEach(() => {
    archiveProductServiceByIdMock.mockReset();
    getProductServiceByIdForOrganizationMock.mockReset();
  });

  it("archives the addressed product through the canonical service", async () => {
    getProductServiceByIdForOrganizationMock.mockResolvedValue({ id: "p1", status: "ACTIVE" });
    archiveProductServiceByIdMock.mockResolvedValue(undefined);

    const result = await productArchiveHandler(envelope({ productServiceId: "p1" }));

    expect(archiveProductServiceByIdMock).toHaveBeenCalledWith("p1", "org-1");
    expect(result).toMatchObject({ status: "SUCCESS", entityRef: { entityType: "product", entityId: "p1" } });
    expect(result.resultOutcome).toBeUndefined();
  });

  it("reports NO_CHANGE without a second mutation when the product is already archived", async () => {
    getProductServiceByIdForOrganizationMock.mockResolvedValue({ id: "p1", status: "ARCHIVED" });

    const result = await productArchiveHandler(envelope({ productServiceId: "p1" }));

    expect(archiveProductServiceByIdMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "SUCCESS", resultOutcome: "NO_CHANGE" });
  });

  it("rejects a missing productServiceId before mutation", async () => {
    await expect(productArchiveHandler(envelope({}))).rejects.toThrow(/productServiceId/);
    expect(archiveProductServiceByIdMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown productServiceId", async () => {
    getProductServiceByIdForOrganizationMock.mockResolvedValue(null);
    await expect(productArchiveHandler(envelope({ productServiceId: "missing" }))).rejects.toThrow(/not found/);
  });
});
