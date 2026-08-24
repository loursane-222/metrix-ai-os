import type { ReactElement } from "react";
import { CompanyOperatingScreen } from "@/components/company/CompanyOperatingScreen";
import { CustomerCreateScreen } from "@/components/customers/CustomerCreateScreen";
import { CustomerEditScreen } from "@/components/customers/CustomerEditScreen";
import { OfferEditScreen } from "@/components/offers/OfferEditScreen";
import { OfferCreateScreen } from "@/components/offers/OfferCreateScreen";
import { TaskCreateScreen } from "./TaskCreateScreen";
import type { WorkspaceDirective } from "@/lib/living-workspace";
import { CanonicalDomainSurface } from "./CanonicalDomainSurface";
import { CalendarWorkspace } from "./CalendarWorkspace";
import { TeamMembersSurface } from "./TeamMembersSurface";
import { SupplierCreateScreen } from "./SupplierCreateScreen";
import { OrderCreateScreen } from "./OrderCreateScreen";
import { DeliveryCreateScreen } from "./DeliveryCreateScreen";
import { StockCreateScreen } from "./StockCreateScreen";
import { OrderActionSurface } from "@/components/orders/OrderActionSurface";
import { DeliveryActionSurface } from "@/components/deliveries/DeliveryActionSurface";
import { InvoiceActionSurface } from "@/components/invoices/InvoiceActionSurface";
import { PaymentActionSurface } from "@/components/payments/PaymentActionSurface";
import { SupplierEditSurface } from "@/components/suppliers/SupplierEditSurface";
import { TaskActionSurface } from "@/components/tasks/TaskActionSurface";
import { ProductEditSurface } from "@/components/products/ProductEditSurface";
import { GoalCreateSurface } from "@/components/goals/GoalCreateSurface";
import { GoalEditSurface } from "@/components/goals/GoalEditSurface";
import { ProductionCreateScreen } from "./ProductionCreateScreen";
import { ProductionOrderEditSurface } from "@/components/production/ProductionOrderEditSurface";
import { CustomerImportWizard } from "@/components/customers/CustomerImportWizard";
import { ProductImportWizard } from "@/components/products/ProductImportWizard";
import { InvoiceImportWizard } from "@/components/invoices/InvoiceImportWizard";
import { SupplierImportWizard } from "@/components/suppliers/SupplierImportWizard";
import { PaymentImportWizard } from "@/components/payments/PaymentImportWizard";
import { OfferImportWizard } from "@/components/offers/OfferImportWizard";
import { OrderImportWizard } from "@/components/orders/OrderImportWizard";
import { DeliveryImportWizard } from "@/components/deliveries/DeliveryImportWizard";
import { StockImportWizard } from "@/components/stock/StockImportWizard";
import { ProductionImportWizard } from "@/components/production/ProductionImportWizard";

const CANONICAL_SURFACES = ["customer-list", "task-list", "task-detail", "offer-list", "invoice-list", "payment-list", "collection-list", "product-list", "goal-list", "supplier-list", "order-list", "delivery-list", "stock-list", "document-list", "kpi-list", "production-list"] as const;

/** Resolves every record-list surface through the shared canonical presentation. */
export function resolveBusinessSurface(directive: WorkspaceDirective, readiness?: { onReady: () => void; onFailure: () => void }): ReactElement | null {
  if (directive.businessSurface === "company-operating") return <CompanyOperatingScreen onReady={readiness?.onReady}/>;
  if (directive.businessSurface === "goal-create") return <GoalCreateSurface onReady={readiness?.onReady}/>;
  if (directive.businessSurface === "goal-list" && directive.entityId) return <GoalEditSurface goalId={directive.entityId} onFailure={readiness?.onFailure} onReady={readiness?.onReady}/>;
  if (directive.businessSurface === "product-list" && directive.entityId) return <ProductEditSurface productId={directive.entityId} onFailure={readiness?.onFailure} onReady={readiness?.onReady} />;
  if (directive.businessSurface === "task-detail" && directive.entityId) return <TaskActionSurface taskId={directive.entityId} onFailure={readiness?.onFailure} onReady={readiness?.onReady} />;
  if (directive.businessSurface === "order-list" && directive.entityId) return <OrderActionSurface orderId={directive.entityId} onFailure={readiness?.onFailure} onReady={readiness?.onReady} />;
  if (directive.businessSurface === "invoice-list" && directive.entityId) return <InvoiceActionSurface invoiceId={directive.entityId} onFailure={readiness?.onFailure} onReady={readiness?.onReady} />;
  if (directive.businessSurface === "payment-list" && directive.entityId) return <PaymentActionSurface paymentId={directive.entityId} onFailure={readiness?.onFailure} onReady={readiness?.onReady} />;
  if (directive.businessSurface === "delivery-list" && directive.entityId) return <DeliveryActionSurface deliveryId={directive.entityId} onFailure={readiness?.onFailure} onReady={readiness?.onReady} />;
  if (directive.businessSurface === "supplier-detail" && directive.entityId) return <SupplierEditSurface supplierId={directive.entityId} onFailure={readiness?.onFailure} onReady={readiness?.onReady} />;
  if (directive.businessSurface === "production-detail" && directive.entityId) return <ProductionOrderEditSurface productionOrderId={directive.entityId} onFailure={readiness?.onFailure} onReady={readiness?.onReady} />;
  if (directive.businessSurface === "customer-create") {
    return <CustomerCreateScreen presentation="living"/>;
  }
  if (directive.businessSurface === "customer-import") return <CustomerImportWizard />;
  if (directive.businessSurface === "product-import") return <ProductImportWizard />;
  if (directive.businessSurface === "invoice-import") return <InvoiceImportWizard />;
  if (directive.businessSurface === "supplier-import") return <SupplierImportWizard />;
  if (directive.businessSurface === "payment-import") return <PaymentImportWizard />;
  if (directive.businessSurface === "offer-import") return <OfferImportWizard />;
  if (directive.businessSurface === "order-import") return <OrderImportWizard />;
  if (directive.businessSurface === "delivery-import") return <DeliveryImportWizard />;
  if (directive.businessSurface === "stock-import") return <StockImportWizard />;
  if (directive.businessSurface === "production-import") return <ProductionImportWizard />;
  if (directive.businessSurface === "supplier-create") return <SupplierCreateScreen />;
  if (directive.businessSurface === "order-create") return <OrderCreateScreen />;
  if (directive.businessSurface === "delivery-create") return <DeliveryCreateScreen />;
  if (directive.businessSurface === "stock-create") return <StockCreateScreen onFailure={readiness?.onFailure} onReady={readiness?.onReady} />;
  if (directive.businessSurface === "production-create") return <ProductionCreateScreen />;
  if ((directive.businessSurface === "customer-edit" || directive.businessSurface === "customer-detail") && directive.entityId) {
    return <CustomerEditScreen customerId={directive.entityId} onSurfaceFailure={readiness?.onFailure} onSurfaceReady={readiness?.onReady} presentation="living"/>;
  }
  if (directive.businessSurface === "task-create") {
    return <TaskCreateScreen presentation="living"/>;
  }
  if (directive.businessSurface === "offer-edit" && directive.entityId) {
    return <OfferEditScreen onSurfaceFailure={readiness?.onFailure} onSurfaceReady={readiness?.onReady} quoteId={directive.entityId} presentation="living"/>;
  }
  if (directive.businessSurface === "offer-create" && directive.entityId) {
    return <OfferCreateScreen customerId={directive.entityId} onSurfaceFailure={readiness?.onFailure} onSurfaceReady={readiness?.onReady} presentation="living"/>;
  }
  if (directive.businessSurface === "calendar") return <CalendarWorkspace onReady={readiness?.onReady} requestId={directive.directiveId} requestedView={directive.calendarView} requestedDate={directive.calendarFocusDate}/>;
  if (directive.businessSurface === "team-members") return <TeamMembersSurface onFailure={readiness?.onFailure} onReady={readiness?.onReady}/>;
  if ((CANONICAL_SURFACES as readonly string[]).includes(directive.businessSurface ?? "")) {
    return <CanonicalDomainSurface directive={directive} onFailure={readiness?.onFailure ?? (() => undefined)} onReady={readiness?.onReady ?? (() => undefined)} />;
  }
  return null;
}

export function businessSurfaceOwnsReadiness(directive: WorkspaceDirective): boolean {
  return directive.businessSurface === "company-operating" || (directive.businessSurface === "task-detail" && Boolean(directive.entityId)) || ((directive.businessSurface === "product-list" || directive.businessSurface === "goal-list" || directive.businessSurface === "order-list" || directive.businessSurface === "delivery-list" || directive.businessSurface === "invoice-list" || directive.businessSurface === "payment-list") && Boolean(directive.entityId)) || directive.businessSurface === "supplier-detail" || directive.businessSurface === "production-detail" || directive.businessSurface === "customer-detail" || directive.businessSurface === "customer-edit" || directive.businessSurface === "offer-edit" || directive.businessSurface === "offer-create" || directive.businessSurface === "goal-create" || directive.businessSurface === "stock-create" || directive.businessSurface === "calendar" || directive.businessSurface === "team-members" || (CANONICAL_SURFACES as readonly string[]).includes(directive.businessSurface ?? "");
}

export function resolveBusinessSurfaceAuthorityKey(directive: WorkspaceDirective): string | null {
  if (directive.businessSurface === "company-operating") return "company.operating.page";
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
  if (directive.businessSurface === "payment-list" && directive.entityId) return "payments.detail.page";
  if (directive.businessSurface === "delivery-list" && directive.entityId) return "deliveries.detail.page";
  if (directive.businessSurface === "supplier-detail" && directive.entityId) return "suppliers.detail.page";
  if (directive.businessSurface === "production-detail" && directive.entityId) return "production.detail.page";
  if (directive.businessSurface === "team-members") return "team.members.page";
  if (directive.businessSurface === "calendar") return "calendar.events.page";
  return null;
}
