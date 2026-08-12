import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { BusinessNavigationDescriptor } from "@/lib/executive-request-resolution";
import { projectBusinessNavigation } from "@/lib/executive-request-resolution";
import {
  createAccountingWorkspaceDirective,
  createCustomerWorkspaceDirective,
  createOfferWorkspaceDirective,
  createProductWorkspaceDirective,
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
  "offers.list": createOfferWorkspaceDirective,
  "offer.create": createOfferWorkspaceDirective,
  "offer.edit": createOfferWorkspaceDirective,
  "products.list": createProductWorkspaceDirective,
  "task.create": createTaskWorkspaceDirective,
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
  { domain: "offer", kind: "offers.list" },
  { domain: "offer", kind: "offer.create", customerId: "cross-check-customer-1" },
  { domain: "offer", kind: "offer.edit", quoteId: "cross-check-quote-1" },
  { domain: "product", kind: "products.list" },
  { domain: "task", kind: "task.create" },
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

  // KNOWN GAP (reported, not fixed in this phase — see report): company.root
  // projects to /metrix/company + "company.operating.page", but there is no
  // createCompanyWorkspaceDirective at all, and ExecutiveNavigationCommandHost's
  // OR-chain has no branch for it. /metrix/company is a real standalone Next.js
  // page (CompanyOperatingScreen.tsx registers "company.operating.page" itself
  // once mounted) — but nothing in the executive-navigation chain ever pushes
  // the browser there, so a spoken/typed "şirketimi göster" command currently
  // fails the same way "Arda Yapı'ya teklif oluştur" did before this fix,
  // unless the user happens to already be on /metrix/company. This test pins
  // that absence so a silent "fix" (e.g. someone adding the branch without
  // updating this test) is caught by the assertion below turning false.
  it("KNOWN GAP: company.root has no createCompanyWorkspaceDirective and no branch in ExecutiveNavigationCommandHost's chain", () => {
    const planner = readFileSync(new URL("../planner.ts", import.meta.url), "utf8");
    const host = readFileSync(new URL("../../../components/input-authority/ExecutiveNavigationCommandHost.tsx", import.meta.url), "utf8");
    const resolver = readFileSync(new URL("../../../components/living-workspace/BusinessSurfaceResolver.tsx", import.meta.url), "utf8");
    expect(planner).not.toContain("createCompanyWorkspaceDirective");
    expect(host).not.toContain("createCompanyWorkspaceDirective");
    expect(resolver).not.toMatch(/["']company["']/u);
  });
});
