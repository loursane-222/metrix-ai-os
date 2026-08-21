import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import { buildCustomerRoute, type CustomerNavigationDescriptor } from "@/lib/customers/customer-navigation";
import { isMetrixSelfReference, resolveCustomerReference, type ResolvableCustomer } from "@/lib/customers/customer-resolution";
import type { ActiveWorkspaceContext } from "@/lib/living-workspace/contracts";

export type CustomerDetailSnapshot = { displayName: string; legalName: string | null; phone: string | null; email: string | null; cariKodu: string | null };

export type BusinessNavigationDescriptor =
  | { domain: "company"; kind: "company.root" }
  | { domain: "accounting"; kind: "accounting.root" }
  | { domain: "report"; kind: "report.root" }
  | { domain: "document"; kind: "document.root" }
  | { domain: "kpi"; kind: "kpi.root" }
  | { domain: "offer"; kind: "offers.list" }
  | { domain: "offer"; kind: "offer.create"; customerId: string }
  | { domain: "offer"; kind: "offer.edit"; quoteId: string }
  | { domain: "product"; kind: "products.list" }
  | { domain: "task"; kind: "task.create" }
  | { domain: "team"; kind: "team.manage" }
  | ({ domain: "customer" } & CustomerNavigationDescriptor);

export type BusinessNavigationResolution =
  | {
      status: "RESOLVED";
      descriptor: BusinessNavigationDescriptor;
      confidence: "high" | "medium" | "low";
      // Only populated for customers.list — the actual names already fetched
      // from the canonical repository, so the chat narration can name them
      // instead of disagreeing with the list surface rendered from the same
      // query (see BusinessNavigationOperationEvidence's CUSTOMER_LIST case).
      listSnapshot?: { recordCount: number; recordNames: readonly string[] };
      // Only populated for customer.detail/customer.edit — the actual resolved
      // customer's identity fields, so an informational ("X hakkında bilgi ver")
      // turn can be narrated from real data instead of the deterministic
      // navigation-only acknowledgment (see CUSTOMER_LOOKUP's detailSnapshot).
      detailSnapshot?: CustomerDetailSnapshot;
    }
  | { status: "CLARIFICATION_REQUIRED"; reason: "AMBIGUOUS_ENTITY" | "MISSING_ENTITY" }
  | { status: "NOT_FOUND" | "UNAVAILABLE" | "NOT_NAVIGATION" };

export type BusinessNavigationOperationEvidence = Readonly<
  | {
      operation: "CUSTOMER_LOOKUP";
      canonicalRepositoryQueried: true;
      outcome: "RESOLVED" | "NOT_FOUND" | "AMBIGUOUS";
      createProposalAllowed: boolean;
      navigationProjected: boolean;
      detailSnapshot?: CustomerDetailSnapshot;
    }
  | {
      operation: "CUSTOMER_LIST";
      canonicalRepositoryQueried: true;
      outcome: "RESOLVED";
      recordCount: number;
      recordNames: readonly string[];
      navigationProjected: true;
    }
  | {
      // The domain/target this turn resolved to is a create-with-Surface
      // operation (a new record's Living Workspace form). Navigation alone
      // never confirms a mutation — this evidence exists so the canonical
      // prompt (route.ts) can tell the model plainly that no execution
      // result is attached, and so a missing conversationExtensionHandoff
      // for the same turn is visible instead of silently dropped.
      operation: "MUTATION_SURFACE_RESOLVED";
      domain: "customer" | "offer" | "task";
    }
>;

export async function resolveBusinessNavigation(input: {
  understanding: ConversationUnderstanding;
  listCustomers: () => Promise<readonly ResolvableCustomer[]>;
  findLatestQuoteIdForCustomer?: (customerId: string) => Promise<string | null>;
  activeWorkspaceContext?: ActiveWorkspaceContext | null;
}): Promise<BusinessNavigationResolution> {
  const request = input.understanding.businessNavigation;
  if (!request) return { status: "NOT_NAVIGATION" };
  // Defense-in-depth for a classifier misread: METRIX's own name is never a
  // real navigation target, regardless of domain/target.
  if (request.entityReference && isMetrixSelfReference(request.entityReference)) return { status: "NOT_NAVIGATION" };
  const activeEntityId = (request.target === "detail" || request.target === "edit")
    && !request.entityReference?.trim()
    && input.activeWorkspaceContext?.domain === request.domain
    && input.activeWorkspaceContext.entityId
      ? input.activeWorkspaceContext.entityId
      : null;
  if ((input.understanding.shouldAskClarification || input.understanding.confidence === "low") && !activeEntityId) return { status: "CLARIFICATION_REQUIRED", reason: "MISSING_ENTITY" };
  if (request.domain === "company" && request.target === "root") return resolved({ domain: "company", kind: "company.root" }, input.understanding.confidence);
  if (request.domain === "accounting" && request.target === "root") return resolved({ domain: "accounting", kind: "accounting.root" }, input.understanding.confidence);
  if (request.domain === "report" && request.target === "root") return resolved({ domain: "report", kind: "report.root" }, input.understanding.confidence);
  if (request.domain === "document" && request.target === "root") return resolved({ domain: "document", kind: "document.root" }, input.understanding.confidence);
  if (request.domain === "kpi" && request.target === "root") return resolved({ domain: "kpi", kind: "kpi.root" }, input.understanding.confidence);
  if (request.domain === "offer" && request.target === "list") return resolved({ domain: "offer", kind: "offers.list" }, input.understanding.confidence);
  if (request.domain === "offer" && (request.target === "create" || request.target === "detail" || request.target === "edit")) {
    if (activeEntityId && (request.target === "detail" || request.target === "edit")) return resolved({ domain: "offer", kind: "offer.edit", quoteId: activeEntityId }, input.understanding.confidence);
    if (!request.entityReference?.trim()) return { status: "CLARIFICATION_REQUIRED", reason: "MISSING_ENTITY" };
    const entity = resolveCustomerReference(await input.listCustomers(), request.entityReference);
    if (entity.status === "NOT_FOUND") return { status: "NOT_FOUND" };
    if (entity.status === "AMBIGUOUS") return { status: "CLARIFICATION_REQUIRED", reason: "AMBIGUOUS_ENTITY" };
    if (request.target === "create") return resolved({ domain: "offer", kind: "offer.create", customerId: entity.customer.id }, input.understanding.confidence);
    const quoteId = await input.findLatestQuoteIdForCustomer?.(entity.customer.id);
    if (!quoteId) return { status: "NOT_FOUND" };
    return resolved({ domain: "offer", kind: "offer.edit", quoteId }, input.understanding.confidence);
  }
  if (request.domain === "product" && request.target === "list") return resolved({ domain: "product", kind: "products.list" }, input.understanding.confidence);
  if (request.domain === "task" && request.target === "create") return resolved({ domain: "task", kind: "task.create" }, input.understanding.confidence);
  if (request.domain === "team" && (request.target === "create" || request.target === "list" || request.target === "root")) return resolved({ domain: "team", kind: "team.manage" }, input.understanding.confidence);
  if (request.domain !== "customer") return { status: "UNAVAILABLE" };
  if (request.target === "list") {
    const customers = await input.listCustomers();
    return resolved(
      { domain: "customer", kind: "customers.list" },
      input.understanding.confidence,
      { recordCount: customers.length, recordNames: customers.map((c) => c.displayName) },
    );
  }
  if (request.target === "create") return resolved({ domain: "customer", kind: "customer.create" }, input.understanding.confidence);
  if ((request.target === "detail" || request.target === "edit") && activeEntityId) {
    return resolved(
      { domain: "customer", kind: request.target === "edit" ? "customer.edit" : "customer.detail", customerId: activeEntityId },
      input.understanding.confidence,
    );
  }
  if ((request.target !== "detail" && request.target !== "edit") || !request.entityReference?.trim()) return { status: "CLARIFICATION_REQUIRED", reason: "MISSING_ENTITY" };
  const entity = resolveCustomerReference(await input.listCustomers(), request.entityReference);
  if (entity.status === "NOT_FOUND") return { status: "NOT_FOUND" };
  if (entity.status === "AMBIGUOUS") return { status: "CLARIFICATION_REQUIRED", reason: "AMBIGUOUS_ENTITY" };
  return resolved(
    { domain: "customer", kind: request.target === "edit" ? "customer.edit" : "customer.detail", customerId: entity.customer.id },
    input.understanding.confidence,
    undefined,
    { displayName: entity.customer.displayName, legalName: entity.customer.legalName, phone: entity.customer.phone, email: entity.customer.email, cariKodu: entity.customer.cariKodu },
  );
}

export function projectBusinessNavigation(descriptor: BusinessNavigationDescriptor): { route: string; expectedSurfaceAuthorityKey: string } {
  if (descriptor.domain === "customer") {
    const authority = descriptor.kind === "customer.create" ? "customers.customer.create" : descriptor.kind === "customer.edit" ? "customers.edit.page" : descriptor.kind === "customer.detail" ? "customers.detail.page" : "customers.list.page";
    return { route: buildCustomerRoute(descriptor), expectedSurfaceAuthorityKey: authority };
  }
  if (descriptor.kind === "company.root") return { route: "/metrix/company", expectedSurfaceAuthorityKey: "company.operating.page" };
  if (descriptor.kind === "accounting.root") return { route: "/metrix/accounting", expectedSurfaceAuthorityKey: "workspace.accounting.page" };
  if (descriptor.kind === "report.root") return { route: "/metrix/reports", expectedSurfaceAuthorityKey: "workspace.report.page" };
  if (descriptor.kind === "document.root") return { route: "/metrix/documents", expectedSurfaceAuthorityKey: "workspace.document.page" };
  if (descriptor.kind === "kpi.root") return { route: "/metrix/kpis", expectedSurfaceAuthorityKey: "workspace.kpi.page" };
  if (descriptor.kind === "offers.list") return { route: "/metrix/offers", expectedSurfaceAuthorityKey: "offers.list.page" };
  if (descriptor.kind === "offer.create") return { route: `/metrix/offers/create/${descriptor.customerId}`, expectedSurfaceAuthorityKey: "offers.create.page" };
  if (descriptor.kind === "offer.edit") return { route: `/metrix/offers/${descriptor.quoteId}/edit`, expectedSurfaceAuthorityKey: "offers.edit.page" };
  if (descriptor.kind === "task.create") return { route: "/metrix/tasks/new", expectedSurfaceAuthorityKey: "tasks.task.create" };
  if (descriptor.kind === "team.manage") return { route: "/metrix/team", expectedSurfaceAuthorityKey: "team.members.page" };
  return { route: "/metrix/products", expectedSurfaceAuthorityKey: "workspace.product.page" };
}

export function projectBusinessNavigationOperationEvidence(
  resolution: BusinessNavigationResolution,
): BusinessNavigationOperationEvidence | null {
  if (resolution.status === "RESOLVED" && resolution.descriptor.domain === "customer" && (resolution.descriptor.kind === "customer.detail" || resolution.descriptor.kind === "customer.edit")) return { operation: "CUSTOMER_LOOKUP", canonicalRepositoryQueried: true, outcome: "RESOLVED", createProposalAllowed: false, navigationProjected: true, detailSnapshot: resolution.detailSnapshot };
  if (resolution.status === "RESOLVED" && resolution.descriptor.domain === "customer" && resolution.descriptor.kind === "customers.list" && resolution.listSnapshot) {
    return {
      operation: "CUSTOMER_LIST",
      canonicalRepositoryQueried: true,
      outcome: "RESOLVED",
      recordCount: resolution.listSnapshot.recordCount,
      recordNames: resolution.listSnapshot.recordNames,
      navigationProjected: true,
    };
  }
  if (resolution.status === "RESOLVED" && resolution.descriptor.domain === "customer" && resolution.descriptor.kind === "customer.create") return { operation: "MUTATION_SURFACE_RESOLVED", domain: "customer" };
  if (resolution.status === "RESOLVED" && resolution.descriptor.domain === "offer" && resolution.descriptor.kind === "offer.create") return { operation: "MUTATION_SURFACE_RESOLVED", domain: "offer" };
  if (resolution.status === "RESOLVED" && resolution.descriptor.domain === "task" && resolution.descriptor.kind === "task.create") return { operation: "MUTATION_SURFACE_RESOLVED", domain: "task" };
  if (resolution.status === "NOT_FOUND") return { operation: "CUSTOMER_LOOKUP", canonicalRepositoryQueried: true, outcome: "NOT_FOUND", createProposalAllowed: true, navigationProjected: false };
  if (resolution.status === "CLARIFICATION_REQUIRED" && resolution.reason === "AMBIGUOUS_ENTITY") return { operation: "CUSTOMER_LOOKUP", canonicalRepositoryQueried: true, outcome: "AMBIGUOUS", createProposalAllowed: false, navigationProjected: false };
  return null;
}

function resolved(
  descriptor: BusinessNavigationDescriptor,
  confidence: "high" | "medium" | "low",
  listSnapshot?: { recordCount: number; recordNames: readonly string[] },
  detailSnapshot?: CustomerDetailSnapshot,
): BusinessNavigationResolution {
  return { status: "RESOLVED", descriptor, confidence, listSnapshot, detailSnapshot };
}
