import { listCustomers } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { listSuppliers } from "@/lib/core/suppliers/supplier.service";
import { listProductServices } from "@/lib/core/products/product.service";
import { listOrders } from "@/lib/core/orders/order.service";
import { listInvoices } from "@/lib/core/invoices/invoice.service";
import { listQuotesByOrganization } from "@/lib/core/quotes/quote.service";
import { listDeliveries } from "@/lib/core/deliveries/delivery.service";

export type EntityResolution = Readonly<
  | { status: "RESOLVED"; id: string; label: string }
  | { status: "AMBIGUOUS"; options: readonly string[] }
  | { status: "NOT_FOUND" }
>;

export type EntityResolverDomain =
  | "customer"
  | "supplier"
  | "product"
  | "order"
  | "invoice"
  | "quote"
  | "delivery";

// Maps the actual field names used across action-runtime's input schemas to
// the resolver domain that can turn a plain-language reference (a name, an
// order/invoice/delivery number) into a real id. The general planner never
// trusts the model to invent one of these ids directly — every field listed
// here is resolved against real organization-scoped data first. Fields not
// listed here (task/payment/production/stock/company ids) are not yet
// resolvable by name; the planner asks for the raw id or a matching action
// that doesn't need one instead of guessing.
export const ENTITY_REFERENCE_FIELDS: Readonly<Record<string, EntityResolverDomain>> = {
  customerId: "customer",
  supplierId: "supplier",
  productServiceId: "product",
  orderId: "order",
  sourceOrderId: "order",
  invoiceId: "invoice",
  quoteId: "quote",
  sourceQuoteId: "quote",
  deliveryId: "delivery",
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9@+]/g, "");
}

function resolveByLabel(records: readonly { id: string; label: string }[], ref: string): EntityResolution {
  const needle = normalize(ref);
  if (!needle) return { status: "NOT_FOUND" };
  const exact = records.filter((record) => normalize(record.label) === needle);
  if (exact.length === 1) return { status: "RESOLVED", id: exact[0]!.id, label: exact[0]!.label };
  if (exact.length > 1) return { status: "AMBIGUOUS", options: exact.map((record) => record.label) };
  const partial = records.filter((record) => normalize(record.label).includes(needle));
  if (partial.length === 1) return { status: "RESOLVED", id: partial[0]!.id, label: partial[0]!.label };
  if (partial.length > 1) return { status: "AMBIGUOUS", options: partial.map((record) => record.label) };
  return { status: "NOT_FOUND" };
}

async function resolveCustomer(organizationId: string, ref: string): Promise<EntityResolution> {
  const customers = await listCustomers({ organizationId, limit: 5000 });
  const resolution = resolveCustomerReference(customers, ref);
  if (resolution.status === "RESOLVED") return { status: "RESOLVED", id: resolution.customer.id, label: resolution.customer.displayName };
  if (resolution.status === "AMBIGUOUS") return { status: "AMBIGUOUS", options: resolution.options.map((option) => option.displayName) };
  return { status: "NOT_FOUND" };
}

async function resolveSupplier(organizationId: string, ref: string): Promise<EntityResolution> {
  const suppliers = await listSuppliers({ organizationId, limit: 5000 });
  return resolveByLabel(suppliers.map((supplier) => ({ id: supplier.id, label: supplier.displayName })), ref);
}

async function resolveProduct(organizationId: string, ref: string): Promise<EntityResolution> {
  const products = await listProductServices({ organizationId, limit: 5000 });
  return resolveByLabel(products.map((product) => ({ id: product.id, label: product.name })), ref);
}

async function resolveOrder(organizationId: string, ref: string): Promise<EntityResolution> {
  const orders = await listOrders({ organizationId, limit: 500 });
  return resolveByLabel(orders.map((order) => ({ id: order.id, label: order.orderNumber })), ref);
}

async function resolveInvoice(organizationId: string, ref: string): Promise<EntityResolution> {
  const invoices = await listInvoices(organizationId);
  return resolveByLabel(invoices.map((invoice) => ({ id: invoice.id, label: invoice.invoiceNumber })), ref);
}

async function resolveQuote(organizationId: string, ref: string): Promise<EntityResolution> {
  const quotes = await listQuotesByOrganization({ organizationId, limit: 500 });
  return resolveByLabel(quotes.map((quote) => ({ id: quote.id, label: quote.title })), ref);
}

async function resolveDelivery(organizationId: string, ref: string): Promise<EntityResolution> {
  const deliveries = await listDeliveries({ organizationId, limit: 500 });
  return resolveByLabel(deliveries.map((delivery) => ({ id: delivery.id, label: delivery.deliveryNumber })), ref);
}

const RESOLVERS: Readonly<Record<EntityResolverDomain, (organizationId: string, ref: string) => Promise<EntityResolution>>> = {
  customer: resolveCustomer,
  supplier: resolveSupplier,
  product: resolveProduct,
  order: resolveOrder,
  invoice: resolveInvoice,
  quote: resolveQuote,
  delivery: resolveDelivery,
};

export function resolveEntityReference(domain: EntityResolverDomain, organizationId: string, ref: string): Promise<EntityResolution> {
  return RESOLVERS[domain](organizationId, ref);
}
