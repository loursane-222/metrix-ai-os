import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import { buildCustomerRoute, type CustomerNavigationDescriptor } from "@/lib/customers/customer-navigation";
import { resolveCustomerReference, type ResolvableCustomer } from "@/lib/customers/customer-resolution";

export type BusinessNavigationDescriptor =
  | { domain: "company"; kind: "company.root" }
  | { domain: "offer"; kind: "offers.list" }
  | { domain: "offer"; kind: "offer.create"; customerId: string }
  | { domain: "offer"; kind: "offer.edit"; quoteId: string }
  | { domain: "product"; kind: "products.list" }
  | ({ domain: "customer" } & CustomerNavigationDescriptor);

export type BusinessNavigationResolution =
  | { status: "RESOLVED"; descriptor: BusinessNavigationDescriptor; confidence: "high" | "medium" | "low" }
  | { status: "CLARIFICATION_REQUIRED"; reason: "AMBIGUOUS_ENTITY" | "MISSING_ENTITY" }
  | { status: "NOT_FOUND" | "UNAVAILABLE" | "NOT_NAVIGATION" };

export type BusinessNavigationOperationEvidence = Readonly<{
  operation: "CUSTOMER_LOOKUP";
  canonicalRepositoryQueried: true;
  outcome: "RESOLVED" | "NOT_FOUND" | "AMBIGUOUS";
  createProposalAllowed: boolean;
  navigationProjected: boolean;
}>;

export async function resolveBusinessNavigation(input: {
  understanding: ConversationUnderstanding;
  listCustomers: () => Promise<readonly ResolvableCustomer[]>;
  findLatestQuoteIdForCustomer?: (customerId: string) => Promise<string | null>;
}): Promise<BusinessNavigationResolution> {
  const request = input.understanding.businessNavigation;
  if (!request) return { status: "NOT_NAVIGATION" };
  if (input.understanding.shouldAskClarification || input.understanding.confidence === "low") return { status: "CLARIFICATION_REQUIRED", reason: "MISSING_ENTITY" };
  if (request.domain === "company" && request.target === "root") return resolved({ domain: "company", kind: "company.root" }, input.understanding.confidence);
  if (request.domain === "offer" && request.target === "list") return resolved({ domain: "offer", kind: "offers.list" }, input.understanding.confidence);
  if (request.domain === "offer" && (request.target === "create" || request.target === "detail" || request.target === "edit")) {
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
  if (request.domain !== "customer") return { status: "UNAVAILABLE" };
  if (request.target === "list") return resolved({ domain: "customer", kind: "customers.list" }, input.understanding.confidence);
  if (request.target === "create") return resolved({ domain: "customer", kind: "customer.create" }, input.understanding.confidence);
  if ((request.target !== "detail" && request.target !== "edit") || !request.entityReference?.trim()) return { status: "CLARIFICATION_REQUIRED", reason: "MISSING_ENTITY" };
  const entity = resolveCustomerReference(await input.listCustomers(), request.entityReference);
  if (entity.status === "NOT_FOUND") return { status: "NOT_FOUND" };
  if (entity.status === "AMBIGUOUS") return { status: "CLARIFICATION_REQUIRED", reason: "AMBIGUOUS_ENTITY" };
  return resolved({ domain: "customer", kind: request.target === "edit" ? "customer.edit" : "customer.detail", customerId: entity.customer.id }, input.understanding.confidence);
}

export function projectBusinessNavigation(descriptor: BusinessNavigationDescriptor): { route: string; expectedSurfaceAuthorityKey: string } {
  if (descriptor.domain === "customer") {
    const authority = descriptor.kind === "customer.create" ? "customers.customer.create" : descriptor.kind === "customer.edit" ? "customers.edit.page" : descriptor.kind === "customer.detail" ? "customers.detail.page" : "customers.list.page";
    return { route: buildCustomerRoute(descriptor), expectedSurfaceAuthorityKey: authority };
  }
  if (descriptor.kind === "company.root") return { route: "/metrix/company", expectedSurfaceAuthorityKey: "company.operating.page" };
  if (descriptor.kind === "offers.list") return { route: "/metrix/offers", expectedSurfaceAuthorityKey: "offers.list.page" };
  if (descriptor.kind === "offer.create") return { route: `/metrix/offers/create/${descriptor.customerId}`, expectedSurfaceAuthorityKey: "offers.create.page" };
  if (descriptor.kind === "offer.edit") return { route: `/metrix/offers/${descriptor.quoteId}/edit`, expectedSurfaceAuthorityKey: "offers.edit.page" };
  return { route: "/metrix/products", expectedSurfaceAuthorityKey: "workspace.product.page" };
}

export function projectBusinessNavigationOperationEvidence(
  resolution: BusinessNavigationResolution,
): BusinessNavigationOperationEvidence | null {
  if (resolution.status === "RESOLVED" && resolution.descriptor.domain === "customer" && (resolution.descriptor.kind === "customer.detail" || resolution.descriptor.kind === "customer.edit")) return { operation: "CUSTOMER_LOOKUP", canonicalRepositoryQueried: true, outcome: "RESOLVED", createProposalAllowed: false, navigationProjected: true };
  if (resolution.status === "NOT_FOUND") return { operation: "CUSTOMER_LOOKUP", canonicalRepositoryQueried: true, outcome: "NOT_FOUND", createProposalAllowed: true, navigationProjected: false };
  if (resolution.status === "CLARIFICATION_REQUIRED" && resolution.reason === "AMBIGUOUS_ENTITY") return { operation: "CUSTOMER_LOOKUP", canonicalRepositoryQueried: true, outcome: "AMBIGUOUS", createProposalAllowed: false, navigationProjected: false };
  return null;
}

function resolved(descriptor: BusinessNavigationDescriptor, confidence: "high" | "medium" | "low"): BusinessNavigationResolution { return { status: "RESOLVED", descriptor, confidence }; }
