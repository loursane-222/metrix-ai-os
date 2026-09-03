import { beforeEach, describe, expect, it, vi } from "vitest";

const { getProductServiceByIdForOrganizationMock, updateProductServiceDetailsMock } = vi.hoisted(() => ({
  getProductServiceByIdForOrganizationMock: vi.fn(),
  updateProductServiceDetailsMock: vi.fn(),
}));
vi.mock("@/lib/core/products/product.service", () => ({
  getProductServiceByIdForOrganization: getProductServiceByIdForOrganizationMock,
  updateProductServiceDetails: updateProductServiceDetailsMock,
}));

import { productUpdateHandler } from "../product-update-handler";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "product.update",
  input,
  executionContext: { actorId: "actor-1", organizationId: "org-1", role: "OWNER", permissions: ["products.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("productUpdateHandler", () => {
  beforeEach(() => {
    getProductServiceByIdForOrganizationMock.mockReset();
    updateProductServiceDetailsMock.mockReset();
  });

  it("patches only the addressed fields and captures a reverse-patch compensation snapshot", async () => {
    getProductServiceByIdForOrganizationMock
      .mockResolvedValueOnce({ id: "p1", name: "Eski İsim", priceCents: BigInt(1000) })
      .mockResolvedValueOnce({ id: "p1", name: "Yeni İsim", priceCents: BigInt(1500) });
    updateProductServiceDetailsMock.mockResolvedValue(undefined);

    const result = await productUpdateHandler(envelope({ productServiceId: "p1", name: "Yeni İsim", priceCents: 1500 }));

    expect(updateProductServiceDetailsMock).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", organizationId: "org-1", name: "Yeni İsim", priceCents: BigInt(1500) }));
    expect(result.metadata?.changedFields).toEqual(["name", "priceCents"]);
    expect(result.compensationSnapshot).toEqual({ productServiceId: "p1", name: "Eski İsim", priceCents: 1000 });
  });

  it("rejects when the product does not exist", async () => {
    getProductServiceByIdForOrganizationMock.mockResolvedValue(null);
    await expect(productUpdateHandler(envelope({ productServiceId: "missing", name: "X" }))).rejects.toThrow(/not found/);
    expect(updateProductServiceDetailsMock).not.toHaveBeenCalled();
  });

  it("rejects when no updatable field is provided", async () => {
    await expect(productUpdateHandler(envelope({ productServiceId: "p1" }))).rejects.toThrow(/At least one/);
  });
});
