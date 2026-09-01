import type { WorkspaceDirective } from "@/lib/living-workspace";

export function resolveBusinessSurfaceAuthorityKey(directive: WorkspaceDirective): string | null {
  if (directive.businessSurface === "company-operating") return "company.operating.page";
  if (directive.businessSurface === "goal-performance-dashboard") return "goals.performance.page";
  if (directive.businessSurface === "task-detail" && directive.entityId) return "tasks.detail.page";
  if (directive.businessSurface === "product-list" && directive.entityId) return "products.detail.page";
  if (directive.businessSurface === "goal-create") return "goals.create.page";
  if (directive.businessSurface === "goal-list" && directive.entityId) return "goals.detail.page";
  if (directive.businessSurface === "customer-list") return "customers.list.page";
  if (directive.businessSurface === "customer-detail") return "customers.detail.page";
  if (directive.businessSurface === "customer-create") return "customers.customer.create";
  if (directive.businessSurface === "customer-import") return "customers.import.page";
  if (directive.businessSurface === "product-import") return "products.import.page";
  if (directive.businessSurface === "invoice-import") return "invoices.import.page";
  if (directive.businessSurface === "supplier-import") return "suppliers.import.page";
  if (directive.businessSurface === "payment-import") return "payments.import.page";
  if (directive.businessSurface === "offer-import") return "offers.import.page";
  if (directive.businessSurface === "order-import") return "orders.import.page";
  if (directive.businessSurface === "delivery-import") return "deliveries.import.page";
  if (directive.businessSurface === "stock-import") return "stock.import.page";
  if (directive.businessSurface === "production-import") return "production.import.page";
  if (directive.businessSurface === "offer-edit") return "offers.edit.page";
  if (directive.businessSurface === "offer-create") return "offers.create.page";
  if (directive.businessSurface === "order-list" && directive.entityId) return "orders.detail.page";
  if (directive.businessSurface === "invoice-list" && directive.entityId) return "invoices.detail.page";
  if (directive.businessSurface === "payment-list" && !directive.entityId) return "collections.list.page";
  if (directive.businessSurface === "payment-list" && directive.entityId) return "payments.detail.page";
  if (directive.businessSurface === "delivery-list" && directive.entityId) return "deliveries.detail.page";
  if (directive.businessSurface === "supplier-detail" && directive.entityId) return "suppliers.detail.page";
  if (directive.businessSurface === "production-detail" && directive.entityId) return "production.detail.page";
  if (directive.businessSurface === "team-members") return "team.members.page";
  if (directive.businessSurface === "calendar") return "calendar.events.page";
  return null;
}
