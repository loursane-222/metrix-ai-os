import { ActionRegistry, createActionRegistry } from "./action-registry";
import { collectionActionDefinitions } from "./manifests/collections.actions";
import { customerActionDefinitions } from "./manifests/customers.actions";
import { paymentActionDefinitions } from "./manifests/payments.actions";
import { quoteActionDefinitions } from "./manifests/quotes.actions";
import { surfaceActionDefinitions } from "./manifests/surface.actions";
import { executiveActionDefinitions } from "./manifests/executive-actions.actions";
import { productActionDefinitions } from "./manifests/products.actions";
import { executiveActionCreateDefinitions } from "./manifests/executive-action-create.actions";
import { companyActionDefinitions } from "./manifests/company.actions";
import { taskActionDefinitions } from "./manifests/tasks.actions";
import { invoiceActionDefinitions } from "./manifests/invoices.actions";
import { supplierActionDefinitions } from "./manifests/suppliers.actions";
import { orderActionDefinitions } from "./manifests/orders.actions";
import { deliveryActionDefinitions } from "./manifests/deliveries.actions";
import { stockActionDefinitions } from "./manifests/stock.actions";
import { productionActionDefinitions } from "./manifests/production.actions";
import { integrationActionDefinitions } from "./manifests/integrations.actions";
import { fieldVisitActionDefinitions } from "./manifests/field-visits.actions";
import type { ActionDefinition } from "./action-registry.types";

export * from "./action-registry.errors";
export * from "./action-registry.types";
export { ActionRegistry, createActionRegistry };

/**
 * Registry mantıksal olarak merkezi, fiziksel olarak federatiftir:
 * her modül kendi manifest dosyasının sahibidir, bu dosya yalnızca
 * onları birleştirir. Yeni bir modül eklemek, buraya bir manifest
 * daha eklemekten ibarettir — çekirdek ActionRegistry değişmez.
 */
const MODULE_MANIFESTS: readonly ActionDefinition[][] = [
  customerActionDefinitions,
  quoteActionDefinitions,
  paymentActionDefinitions,
  collectionActionDefinitions,
  surfaceActionDefinitions,
  executiveActionDefinitions,
  productActionDefinitions,
  executiveActionCreateDefinitions,
  companyActionDefinitions,
  taskActionDefinitions,
  invoiceActionDefinitions,
  supplierActionDefinitions,
  orderActionDefinitions,
  deliveryActionDefinitions,
  stockActionDefinitions,
  productionActionDefinitions,
  integrationActionDefinitions,
  fieldVisitActionDefinitions,
];

function bootstrapActionRegistry(): ActionRegistry {
  const registry = createActionRegistry();

  for (const manifest of MODULE_MANIFESTS) {
    registry.registerMany(manifest);
  }

  return registry;
}

export const actionRegistry = bootstrapActionRegistry();
