// Single, domain-agnostic authority mapping a ListableDomain to how its real
// snapshot (count + a name sample) is fetched — the grounding-data
// counterpart of buildUniversalHandoffMessage (conversation-extension-handoff-message.ts),
// which already generalized action-outcome narration the same way. Adding a
// new listable domain here is the entire cost of grounding its free-form
// status/list questions; no per-domain evidence type or prompt branch needed.
//
// Dynamic imports (not top-level) on purpose: every domain module pulls in
// the Prisma singleton at import time, which throws when DATABASE_URL isn't
// set. Several unrelated test suites (e.g. the business-navigation directive
// cross-check) import only types/route-projection from this package's index
// and never call this function — a top-level import would break them just
// for sharing a barrel file with this module.
import type { ListableDomain } from "./business-navigation";

export type ListableDomainSnapshot = Readonly<{ recordCount: number; recordNames: readonly string[] }>;

// Turkish label used in deterministic narration (buildBusinessNavigationMessage)
// and prompt-evidence instructions.
export const LISTABLE_DOMAIN_LABELS: Record<ListableDomain, string> = {
  stock: "Stok",
  order: "Sipariş",
  invoice: "Fatura",
  payment: "Tahsilat",
  supplier: "Tedarikçi",
  product: "Ürün",
  task: "Görev",
};

export function buildListableDomainSnapshotFetcher(organizationId: string): (domain: ListableDomain) => Promise<ListableDomainSnapshot> {
  return async (domain) => {
    switch (domain) {
      case "stock": {
        const { countStock, listStock } = await import("@/lib/core/stock/stock.service");
        const [rows, recordCount] = await Promise.all([listStock({ organizationId }), countStock({ organizationId })]);
        return { recordCount, recordNames: rows.map((r) => r.productService.name) };
      }
      case "order": {
        const { countOrders, listOrders } = await import("@/lib/core/orders/order.service");
        const [rows, recordCount] = await Promise.all([listOrders({ organizationId }), countOrders({ organizationId })]);
        return { recordCount, recordNames: rows.map((r) => r.orderNumber) };
      }
      case "invoice": {
        const { countInvoices, listInvoices } = await import("@/lib/core/invoices/invoice.service");
        const [rows, recordCount] = await Promise.all([listInvoices(organizationId), countInvoices(organizationId)]);
        return { recordCount, recordNames: rows.map((r) => r.invoiceNumber) };
      }
      case "payment": {
        const { countPayments, listPayments } = await import("@/lib/core/payments/payment.service");
        const [rows, recordCount] = await Promise.all([listPayments(organizationId), countPayments(organizationId)]);
        return { recordCount, recordNames: rows.map((r) => r.title) };
      }
      case "supplier": {
        const { countSuppliers, listSuppliers } = await import("@/lib/core/suppliers/supplier.service");
        const input = { organizationId, status: "ACTIVE" as const };
        const [rows, recordCount] = await Promise.all([listSuppliers(input), countSuppliers(input)]);
        return { recordCount, recordNames: rows.map((r) => r.displayName) };
      }
      case "product": {
        const { countProductServices, listProductServices } = await import("@/lib/core/products/product.service");
        const input = { organizationId };
        const [rows, recordCount] = await Promise.all([listProductServices(input), countProductServices(input)]);
        return { recordCount, recordNames: rows.map((r) => r.name) };
      }
      case "task": {
        const { countTasks, listTasks } = await import("@/lib/core/tasks");
        const input = { organizationId };
        const [rows, recordCount] = await Promise.all([listTasks(input), countTasks(input)]);
        return { recordCount, recordNames: rows.map((r) => r.title) };
      }
    }
  };
}
