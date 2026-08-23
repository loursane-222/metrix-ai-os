import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  customer: { updateMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: db }));

const mocks = vi.hoisted(() => ({ getCustomerStatement: vi.fn() }));
vi.mock("../customer-statement.service", () => ({ getCustomerStatement: mocks.getCustomerStatement }));

const { ensurePublicStatementToken, getPublicStatementByToken } = await import("../customer-statement-public-link.service");

beforeEach(() => { vi.clearAllMocks(); });

describe("ensurePublicStatementToken", () => {
  it("throws when the customer doesn't belong to this organization", async () => {
    db.customer.updateMany.mockResolvedValue({ count: 0 });
    await expect(ensurePublicStatementToken("c-1", "org-1")).rejects.toThrow("Customer not found.");
  });

  it("issues a fresh token and stores only its hash", async () => {
    db.customer.updateMany.mockResolvedValue({ count: 1 });
    const token = await ensurePublicStatementToken("c-1", "org-1");
    expect(token).toEqual(expect.any(String));
    const [call] = db.customer.updateMany.mock.calls[0];
    expect(call.data.publicStatementTokenHash).not.toBe(token);
    expect(call.where).toEqual({ id: "c-1", organizationId: "org-1" });
  });
});

describe("getPublicStatementByToken", () => {
  it("returns null for an unknown token, never leaking a hint either way", async () => {
    db.customer.findFirst.mockResolvedValue(null);
    expect(await getPublicStatementByToken("bad-token")).toBeNull();
  });

  it("returns the live-computed statement for a valid token", async () => {
    db.customer.findFirst.mockResolvedValue({ id: "c-1", organizationId: "org-1", displayName: "Atlas İnşaat", phone: "+905321112233", organization: { name: "METRIX Demo" } });
    mocks.getCustomerStatement.mockResolvedValue({ customer: { id: "c-1", displayName: "Atlas İnşaat" }, movements: [], balances: [{ currency: "TRY", balanceCents: "150000" }], sourceCounts: { invoices: 0, payments: 0, ledgerEntries: 0, ledgerMissingMovements: 0 }, dataQualityNote: null });

    const result = await getPublicStatementByToken("good-token");

    expect(result).not.toBeNull();
    expect(result!.organizationName).toBe("METRIX Demo");
    expect(result!.customerName).toBe("Atlas İnşaat");
    expect(result!.statement.balances).toEqual([{ currency: "TRY", balanceCents: "150000" }]);
    expect(mocks.getCustomerStatement).toHaveBeenCalledWith("org-1", "c-1");
  });
});
