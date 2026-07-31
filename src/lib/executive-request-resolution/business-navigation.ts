import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import { buildCustomerRoute, type CustomerNavigationDescriptor } from "@/lib/customers/customer-navigation";
import { resolveCustomerReference, type ResolvableCustomer } from "@/lib/customers/customer-resolution";

export type BusinessNavigationDescriptor =
  | { domain: "company"; kind: "company.root" }
  | { domain: "offer"; kind: "offers.list" }
  | { domain: "product"; kind: "products.list" }
  | ({ domain: "customer" } & CustomerNavigationDescriptor);

export type BusinessNavigationResolution =
  | { status: "RESOLVED"; descriptor: BusinessNavigationDescriptor; confidence: "high" | "medium" | "low" }
  | { status: "CLARIFICATION_REQUIRED"; reason: "AMBIGUOUS_ENTITY" | "MISSING_ENTITY" }
  | { status: "NOT_FOUND" | "UNAVAILABLE" | "NOT_NAVIGATION" };

export async function resolveBusinessNavigation(input: {
  understanding: ConversationUnderstanding;
  listCustomers: () => Promise<readonly ResolvableCustomer[]>;
}): Promise<BusinessNavigationResolution> {
  const request = input.understanding.businessNavigation;
  if (!request) return { status: "NOT_NAVIGATION" };
  if (input.understanding.shouldAskClarification || input.understanding.confidence === "low") return { status: "CLARIFICATION_REQUIRED", reason: "MISSING_ENTITY" };
  if (request.domain === "company" && request.target === "root") return resolved({ domain: "company", kind: "company.root" }, input.understanding.confidence);
  if (request.domain === "offer" && request.target === "list") return resolved({ domain: "offer", kind: "offers.list" }, input.understanding.confidence);
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
  return { route: "/metrix/products", expectedSurfaceAuthorityKey: "workspace.product.page" };
}

function resolved(descriptor: BusinessNavigationDescriptor, confidence: "high" | "medium" | "low"): BusinessNavigationResolution { return { status: "RESOLVED", descriptor, confidence }; }
