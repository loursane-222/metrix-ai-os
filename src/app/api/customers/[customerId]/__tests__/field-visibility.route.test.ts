import { OrganizationRole } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getCustomer: vi.fn(),
  terms: vi.fn(),
  values: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({ requireAuthContextFromCookies: mocks.auth, authFail: vi.fn() }));
vi.mock("@/lib/core/customers/customer.service", () => ({ getCustomerByIdForOrganization: mocks.getCustomer, updateCustomerDetails: vi.fn() }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { customerCommercialTerms: { findFirst: mocks.terms }, customerCustomFieldValue: { findMany: mocks.values } } }));

import { GET } from "../route";

const customer = {
  id: "customer-1", organizationId: "org-1", displayName: "Atlas Yapı", legalName: "Atlas Yapı A.Ş.", phone: "555", email: "a@atlas.test",
  balanceCents: BigInt(4200), currency: "TRY", tier: "STRATEGIC", healthScore: 91, metrixNote: "Yönetim notu", status: "ACTIVE",
  cariKodu: "C-1", taxNumber: "123", taxOffice: "Konak", mersisNo: "456", tradeRegistryNo: "789", billingAddress: { city: "İzmir" }, shippingAddress: { city: "İzmir" },
  eInvoiceEnabled: true, eArchiveEnabled: true, source: "MANUAL", createdByUserId: "owner-1", updatedByUserId: "owner-1", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02"), primaryContact: null,
};
const commercialTerms = { id: "terms-1", organizationId: "org-1", customerId: "customer-1", paymentTermDays: 30, creditLimitCents: BigInt(100000), defaultCurrency: "TRY", discountRateBasisPoints: null, deliveryTerm: null, notes: null, createdAt: new Date(), updatedAt: new Date() };
const customValues = [{ definitionId: "custom-1", valueJson: "Gizli", definition: { label: "Yönetim alanı", sensitivity: "SENSITIVE" } }];

async function responseFor(role: OrganizationRole) {
  mocks.auth.mockResolvedValue({ organization: { id: "org-1" }, membership: { role }, user: { id: "user-1" } });
  const response = await GET(new Request("http://localhost/api/customers/customer-1"), { params: Promise.resolve({ customerId: "customer-1" }) });
  return (await response.json()).data.customer as Record<string, unknown>;
}

describe("GET /api/customers/[customerId] field visibility", () => {
  beforeEach(() => {
    mocks.getCustomer.mockReset().mockResolvedValue(customer);
    mocks.terms.mockReset().mockResolvedValue(commercialTerms);
    mocks.values.mockReset().mockResolvedValue(customValues);
  });

  it("omits sensitive and internal properties completely for EMPLOYEE", async () => {
    const result = await responseFor(OrganizationRole.EMPLOYEE);
    expect(result).toMatchObject({ id: "customer-1", displayName: "Atlas Yapı", phone: "555", cariKodu: "C-1" });
    for (const field of ["commercialTerms", "metrixNote", "healthScore", "tier", "balanceCents", "taxNumber"]) expect(result).not.toHaveProperty(field);
    expect(result.customFieldValues).toEqual([]);
  });

  it("returns the complete record and sensitive custom values for OWNER", async () => {
    const result = await responseFor(OrganizationRole.OWNER);
    expect(result).toMatchObject({ commercialTerms: { creditLimitCents: "100000" }, metrixNote: "Yönetim notu", healthScore: 91, tier: "STRATEGIC", taxNumber: "123" });
    expect(result.customFieldValues).toEqual([{ definitionId: "custom-1", label: "Yönetim alanı", value: "Gizli" }]);
  });
});
