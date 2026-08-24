import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const detail = readFileSync(fileURLToPath(new URL("../ApprovedDetailWorkspace.tsx", import.meta.url)), "utf8");
const canonical = readFileSync(fileURLToPath(new URL("../CanonicalDomainSurface.tsx", import.meta.url)), "utf8");
const resolver = readFileSync(fileURLToPath(new URL("../BusinessSurfaceResolver.tsx", import.meta.url)), "utf8");

describe("Approved Detail Workspace presentation contract", () => {
  it("keeps the shared shell presentation-only", () => {
    expect(detail).not.toMatch(/@\/lib\//);
    expect(detail).not.toContain("fetch(");
    expect(detail).not.toContain("dispatchConversationNavigation");
    expect(detail).toContain("data-approved-detail-workspace");
  });

  it("keeps the domain overview mounted behind selected detail", () => {
    expect(canonical).toContain("approved-domain-underlay is-detail-open");
    expect(canonical).toContain("<ApprovedDomainWorkspace");
    expect(canonical).toContain("<ApprovedDetailWorkspace");
    expect(canonical).toContain("onBack={() => setSelected(null)}");
  });

  it("projects only existing detail-capable action surfaces", () => {
    for (const component of ["CustomerEditScreen", "TaskActionSurface", "OfferEditScreen", "InvoiceActionSurface", "PaymentActionSurface", "ProductEditSurface", "GoalEditSurface", "SupplierEditSurface", "OrderActionSurface", "DeliveryActionSurface", "ProductionOrderEditSurface"]) expect(canonical).toContain(component);
    expect(canonical).toContain('adapter.supportedQuickActions.includes("open-detail")');
    expect(resolver).toContain('directive.businessSurface === "customer-detail"');
  });
});
