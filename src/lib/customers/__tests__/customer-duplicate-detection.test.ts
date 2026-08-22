import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ customer: { findMany: vi.fn() } }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: db }));
import { detectCustomerDuplicates } from "../customer-duplicate-detection";

describe("detectCustomerDuplicates", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns nothing when no identifying field is present", async () => {
    const result = await detectCustomerDuplicates("org-1", {});
    expect(result).toEqual([]);
    expect(db.customer.findMany).not.toHaveBeenCalled();
  });

  // Live repro: re-importing the same 381-row file after a partial commit
  // found zero duplicates for rows that only ever carried a company name
  // (no tax number, cariKodu, email, or phone) — those rows had nothing to
  // query on before displayName was added as a signal.
  it("treats an exact displayName match as STRONG when it's the only signal available", async () => {
    db.customer.findMany.mockResolvedValue([
      { id: "c1", displayName: "2M Mermer (Mehmet Kocagöz Nakliye)", taxNumber: null, legalName: null, cariKodu: null, email: null, phone: null },
    ]);
    const result = await detectCustomerDuplicates("org-1", { "customer.displayName": "2M Mermer (Mehmet Kocagöz Nakliye)" });
    expect(result).toEqual([{ customerId: "c1", displayName: "2M Mermer (Mehmet Kocagöz Nakliye)", strength: "STRONG", matchedFields: ["displayName"] }]);
    expect(db.customer.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: "org-1", OR: [{ displayName: "2M Mermer (Mehmet Kocagöz Nakliye)" }] } }));
  });

  it("still treats taxNumber as STRONG on its own", async () => {
    db.customer.findMany.mockResolvedValue([
      { id: "c1", displayName: "Atlas İnşaat", taxNumber: "1234567890", legalName: null, cariKodu: null, email: null, phone: null },
    ]);
    const result = await detectCustomerDuplicates("org-1", { "customer.taxNumber": "1234567890" });
    expect(result[0]!.strength).toBe("STRONG");
  });

  it("treats a phone-only match as WEAK", async () => {
    db.customer.findMany.mockResolvedValue([
      { id: "c1", displayName: "Atlas İnşaat", taxNumber: null, legalName: null, cariKodu: null, email: null, phone: "5551112233" },
    ]);
    const result = await detectCustomerDuplicates("org-1", { "customer.displayName": "Farklı Bir İsim", "customer.phone": "5551112233" });
    expect(result[0]!.strength).toBe("WEAK");
    expect(result[0]!.matchedFields).toEqual(["phone"]);
  });
});
