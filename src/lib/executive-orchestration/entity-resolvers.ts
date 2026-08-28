import { listCustomers } from "@/lib/core/customers/customer.service";
import { resolveCustomerReference } from "@/lib/customers/customer-resolution";
import { listSuppliers } from "@/lib/core/suppliers/supplier.service";
import { listProductServices } from "@/lib/core/products/product.service";
import { listOrders } from "@/lib/core/orders/order.service";
import { listInvoices } from "@/lib/core/invoices/invoice.service";
import { listQuotesByOrganization } from "@/lib/core/quotes/quote.service";
import { listDeliveries } from "@/lib/core/deliveries/delivery.service";
import { listProductionOrders, listWorkCenters, listMachines } from "@/lib/core/production/production.service";
import { listWarehousesForOrganization } from "@/lib/core/stock/stock.service";
import { listOpenExecutiveActions } from "@/lib/core/executive-actions/executive-action-engine.service";
import { listActiveCollectionActions } from "@/lib/core/collection-actions/collection-action.service";
import { listPayments } from "@/lib/core/payments/payment.service";
import { listTasks } from "@/lib/core/tasks/task.service";
import { listActiveCompanyUnits } from "@/lib/company/company.service";
import { listDomainCustomFields } from "@/lib/field-authority/custom-field.service";

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
  | "delivery"
  | "production"
  | "warehouse"
  | "workCenter"
  | "executiveAction"
  | "collectionAction"
  | "machine"
  | "payment"
  | "task"
  | "companyUnit"
  | "customFieldDefinition";

// Maps the actual field names used across action-runtime's input schemas to
// the resolver domain that can turn a plain-language reference (a name, an
// order/invoice/delivery number) into a real id. The general planner never
// trusts the model to invent one of these ids directly — every field listed
// here is resolved against real organization-scoped data first. Fields not
// listed here (task/payment/company ids) are not yet resolvable by name;
// the planner asks for the raw id or a matching action that doesn't need
// one instead of guessing.
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
  productionOrderId: "production",
  warehouseId: "warehouse",
  fromWarehouseId: "warehouse",
  toWarehouseId: "warehouse",
  workCenterId: "workCenter",
  executiveActionId: "executiveAction",
  collectionActionId: "collectionAction",
  machineId: "machine",
  paymentId: "payment",
  taskId: "task",
  companyUnitId: "companyUnit",
  definitionId: "customFieldDefinition",
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

async function resolveProduction(organizationId: string, ref: string): Promise<EntityResolution> {
  const productionOrders = await listProductionOrders({ organizationId, limit: 500 });
  return resolveByLabel(productionOrders.map((order) => ({ id: order.id, label: order.orderNumber })), ref);
}

async function resolveWarehouse(organizationId: string, ref: string): Promise<EntityResolution> {
  const warehouses = await listWarehousesForOrganization(organizationId);
  return resolveByLabel(warehouses.map((warehouse) => ({ id: warehouse.id, label: warehouse.name })), ref);
}

async function resolveWorkCenter(organizationId: string, ref: string): Promise<EntityResolution> {
  const workCenters = await listWorkCenters({ organizationId, limit: 500 });
  return resolveByLabel(workCenters.map((workCenter) => ({ id: workCenter.id, label: workCenter.name })), ref);
}

// Only OPEN/IN_PROGRESS executive actions are resolvable — matches exactly
// what executive_action.complete/cancel can act on; a DONE/CANCELLED one is
// not a valid target for either action.
async function resolveExecutiveAction(organizationId: string, ref: string): Promise<EntityResolution> {
  const actions = await listOpenExecutiveActions(organizationId);
  return resolveByLabel(actions.map((action) => ({ id: action.id, label: action.title })), ref);
}

async function resolveCollectionAction(organizationId: string, ref: string): Promise<EntityResolution> {
  const actions = await listActiveCollectionActions(organizationId);
  return resolveByLabel(actions.map((action) => ({ id: action.id, label: action.title })), ref);
}

async function resolveMachine(organizationId: string, ref: string): Promise<EntityResolution> {
  const machines = await listMachines({ organizationId, limit: 500 });
  return resolveByLabel(machines.map((machine) => ({ id: machine.id, label: machine.name })), ref);
}

async function resolvePayment(organizationId: string, ref: string): Promise<EntityResolution> {
  const payments = await listPayments(organizationId);
  return resolveByLabel(payments.map((payment) => ({ id: payment.id, label: payment.title })), ref);
}

async function resolveTask(organizationId: string, ref: string): Promise<EntityResolution> {
  const tasks = await listTasks({ organizationId });
  return resolveByLabel(tasks.map((task) => ({ id: task.id, label: task.title })), ref);
}

async function resolveCompanyUnit(organizationId: string, ref: string): Promise<EntityResolution> {
  const units = await listActiveCompanyUnits(organizationId);
  return resolveByLabel(units.map((unit) => ({ id: unit.id, label: unit.name })), ref);
}

// company.field_definition.deprecate is the only chainable action with a
// definitionId field, and its create counterpart always writes module
// "company"/entityType "company" (see domains/company/index.ts) — scoping
// the resolver candidate set the same way keeps it from ever resolving a
// definitionId that action could never have produced.
async function resolveCustomFieldDefinition(organizationId: string, ref: string): Promise<EntityResolution> {
  const definitions = await listDomainCustomFields(organizationId, "company", "company");
  return resolveByLabel(definitions.map((definition) => ({ id: definition.id, label: definition.label })), ref);
}

const RESOLVERS: Readonly<Record<EntityResolverDomain, (organizationId: string, ref: string) => Promise<EntityResolution>>> = {
  customer: resolveCustomer,
  supplier: resolveSupplier,
  product: resolveProduct,
  order: resolveOrder,
  invoice: resolveInvoice,
  quote: resolveQuote,
  delivery: resolveDelivery,
  production: resolveProduction,
  warehouse: resolveWarehouse,
  workCenter: resolveWorkCenter,
  executiveAction: resolveExecutiveAction,
  collectionAction: resolveCollectionAction,
  machine: resolveMachine,
  payment: resolvePayment,
  task: resolveTask,
  companyUnit: resolveCompanyUnit,
  customFieldDefinition: resolveCustomFieldDefinition,
};

export function resolveEntityReference(domain: EntityResolverDomain, organizationId: string, ref: string): Promise<EntityResolution> {
  return RESOLVERS[domain](organizationId, ref);
}
