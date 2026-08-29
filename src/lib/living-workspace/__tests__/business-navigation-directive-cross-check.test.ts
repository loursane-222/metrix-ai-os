import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BusinessNavigationDescriptor } from "@/lib/executive-request-resolution";
import { projectBusinessNavigation } from "@/lib/executive-request-resolution";
import {
  createAccountingWorkspaceDirective,
  createCalendarWorkspaceDirective,
  createCustomerWorkspaceDirective,
  createDocumentWorkspaceDirective,
  createInvoiceWorkspaceDirective,
  createKpiWorkspaceDirective,
  createOfferWorkspaceDirective,
  createOrderWorkspaceDirective,
  createPaymentWorkspaceDirective,
  createPerformanceDashboardWorkspaceDirective,
  createProductWorkspaceDirective,
  createReportWorkspaceDirective,
  createStockWorkspaceDirective,
  createSupplierWorkspaceDirective,
  createTaskWorkspaceDirective,
  createTeamWorkspaceDirective,
} from "@/lib/living-workspace";

type ProjectableKind = Exclude<BusinessNavigationDescriptor["kind"], "company.root">;
type DirectiveFactory = (input: { route: string; source: "written" | "voice"; correlationId: string }) => unknown;

// This is the permanent cross-check the offer.create bug exposed: every route
// projectBusinessNavigation can produce for a RESOLVED descriptor must be
// recognized by a real create*WorkspaceDirective — otherwise the workspace
// silently never opens (see METRIX_TASK_BRIEF_workspace-acilmama-sorunu.md).
const DIRECTIVE_FACTORY_BY_KIND: Record<ProjectableKind, DirectiveFactory> = {
  "accounting.root": createAccountingWorkspaceDirective,
  "report.root": createReportWorkspaceDirective,
  "document.root": createDocumentWorkspaceDirective,
  "kpi.root": createKpiWorkspaceDirective,
  "performance.root": createPerformanceDashboardWorkspaceDirective,
  "calendar.root": createCalendarWorkspaceDirective,
  "offers.list": createOfferWorkspaceDirective,
  "offer.create": createOfferWorkspaceDirective,
  "offer.edit": createOfferWorkspaceDirective,
  "products.list": createProductWorkspaceDirective,
  "task.create": createTaskWorkspaceDirective,
  "task.list": createTaskWorkspaceDirective,
  "stock.list": createStockWorkspaceDirective,
  "order.list": createOrderWorkspaceDirective,
  "invoice.list": createInvoiceWorkspaceDirective,
  "payment.list": createPaymentWorkspaceDirective,
  "supplier.list": createSupplierWorkspaceDirective,
  "team.manage": createTeamWorkspaceDirective,
  "customers.list": createCustomerWorkspaceDirective,
  "customer.create": createCustomerWorkspaceDirective,
  "customer.detail": createCustomerWorkspaceDirective,
  "customer.edit": createCustomerWorkspaceDirective,
};

// One real example descriptor per BusinessNavigationDescriptor kind (company.root
// excluded on purpose — see the KNOWN GAP test below).
const PROJECTABLE_DESCRIPTORS: readonly BusinessNavigationDescriptor[] = [
  { domain: "accounting", kind: "accounting.root" },
  { domain: "report", kind: "report.root" },
  { domain: "document", kind: "document.root" },
  { domain: "kpi", kind: "kpi.root" },
  { domain: "performance", kind: "performance.root" },
  { domain: "calendar", kind: "calendar.root" },
  { domain: "offer", kind: "offers.list" },
  { domain: "offer", kind: "offer.create", customerId: "cross-check-customer-1" },
  { domain: "offer", kind: "offer.edit", quoteId: "cross-check-quote-1" },
  { domain: "product", kind: "products.list" },
  { domain: "task", kind: "task.create" },
  { domain: "task", kind: "task.list" },
  { domain: "stock", kind: "stock.list" },
  { domain: "order", kind: "order.list" },
  { domain: "invoice", kind: "invoice.list" },
  { domain: "payment", kind: "payment.list" },
  { domain: "supplier", kind: "supplier.list" },
  { domain: "team", kind: "team.manage" },
  { domain: "customer", kind: "customers.list" },
  { domain: "customer", kind: "customer.create" },
  { domain: "customer", kind: "customer.detail", customerId: "cross-check-customer-1" },
  { domain: "customer", kind: "customer.edit", customerId: "cross-check-customer-1" },
];

describe("business navigation route ↔ workspace directive cross-check", () => {
  it.each(PROJECTABLE_DESCRIPTORS)(
    "projectBusinessNavigation's route for $kind resolves through a real create*WorkspaceDirective (not null)",
    (descriptor) => {
      const projected = projectBusinessNavigation(descriptor);
      const factory = DIRECTIVE_FACTORY_BY_KIND[descriptor.kind as ProjectableKind];
      const directive = factory({ route: projected.route, source: "written", correlationId: `cross-check-${descriptor.kind}` });
      expect(
        directive,
        `${descriptor.kind} -> "${projected.route}" produced null; the Living Workspace silently never opens for this navigation.`,
      ).not.toBeNull();
    },
  );

  // Previously a KNOWN GAP: company.root had no createCompanyWorkspaceDirective.
  // Gap was filled: planner exports createCompanyWorkspaceDirective, host has a
  // branch for /metrix/company, and BusinessSurfaceResolver handles company-operating.
  it("company.root gap is filled: createCompanyWorkspaceDirective exists in planner and host, resolver handles company-operating", () => {
    const planner = readFileSync(new URL("../planner.ts", import.meta.url), "utf8");
    const host = readFileSync(new URL("../../../components/input-authority/ExecutiveNavigationCommandHost.tsx", import.meta.url), "utf8");
    const resolver = readFileSync(new URL("../../../components/living-workspace/BusinessSurfaceResolver.tsx", import.meta.url), "utf8");
    expect(planner).toContain("createCompanyWorkspaceDirective");
    expect(host).toContain("createCompanyWorkspaceDirective");
    expect(resolver).toMatch(/company-operating/u);
  });

  // Previously a KNOWN GAP: report.root resolved through resolveBusinessNavigation
  // and had a real createReportWorkspaceDirective (proven above), but the actual
  // client-side dispatcher (ExecutiveNavigationCommandHost.tsx) uses its own
  // separate hardcoded factory chain that createReportWorkspaceDirective was never
  // added to — so a chat request to open Reports silently did nothing. The cross-check
  // above never caught this because it calls the factory directly, bypassing the host's
  // chain entirely. Fixed by adding createReportWorkspaceDirective to that chain.
  it.each(["createReportWorkspaceDirective", "createDocumentWorkspaceDirective", "createKpiWorkspaceDirective", "createPerformanceDashboardWorkspaceDirective"])(
    "%s is actually wired into the client navigation host's dispatch chain (not just the factory/resolver, which this file's other checks call directly)",
    (factoryName) => {
      const host = readFileSync(new URL("../../../components/input-authority/ExecutiveNavigationCommandHost.tsx", import.meta.url), "utf8");
      expect(host).toContain(factoryName);
    },
  );
});
