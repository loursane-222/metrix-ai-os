import { beforeEach, describe, expect, it, vi } from "vitest";

const { createNewProductServiceMock, listProductServicesMock, notifyWithOwnerFanoutMock } = vi.hoisted(() => ({
  createNewProductServiceMock: vi.fn(),
  listProductServicesMock: vi.fn(),
  notifyWithOwnerFanoutMock: vi.fn(),
}));
vi.mock("@/lib/core/products/product.service", () => ({
  createNewProductService: createNewProductServiceMock,
  listProductServices: listProductServicesMock,
}));
vi.mock("@/lib/core/notifications", () => ({
  notifyWithOwnerFanout: notifyWithOwnerFanoutMock,
}));

import { handleProductCreate } from "../register-product-actions";

const envelope = (input: Record<string, unknown>) => ({
  executionId: "exec-1",
  actionName: "product.create",
  input,
  executionContext: { actorId: "user-1", organizationId: "org-1", role: "OWNER", permissions: ["products.write"], sessionRef: "s-1", issuedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T01:00:00Z" },
  startedAt: "2026-01-01T00:00:00Z",
} as never);

describe("handleProductCreate", () => {
  beforeEach(() => {
    createNewProductServiceMock.mockReset();
    listProductServicesMock.mockReset();
    notifyWithOwnerFanoutMock.mockReset();
    listProductServicesMock.mockResolvedValue([]);
    notifyWithOwnerFanoutMock.mockResolvedValue({ additionalTargetResolutions: [] });
  });

  it("notifies the owner when a real new product is created", async () => {
    createNewProductServiceMock.mockResolvedValue({ id: "p1", name: "Çelik Profil" });
    const result = await handleProductCreate(envelope({ name: "Çelik Profil", candidateId: "cand-1" }));
    expect(notifyWithOwnerFanoutMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      actorUserId: "user-1",
      type: "product.created",
      entityType: "ProductService",
      entityId: "p1",
    }));
    expect(result.resultOutcome).toBeUndefined();
  });

  it("does not notify when the product already existed (deduped, no real change)", async () => {
    listProductServicesMock.mockResolvedValue([{ id: "existing-1", name: "Çelik Profil", status: "ACTIVE" }]);
    const result = await handleProductCreate(envelope({ name: "Çelik Profil", candidateId: "cand-1" }));
    expect(createNewProductServiceMock).not.toHaveBeenCalled();
    expect(notifyWithOwnerFanoutMock).not.toHaveBeenCalled();
    expect(result.resultOutcome).toBe("NO_CHANGE");
  });
});
