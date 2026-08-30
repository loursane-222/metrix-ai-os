import { createDurableIdempotencyStore, createExecutionRuntime, createInMemoryHandlerRegistry, ExecutionRuntime } from "../execution";
import { prisma } from "@/lib/core/shared/prisma";
import { registerCustomerActions } from "../domains/customers";
import { executiveLifecycleRegistry } from "@/lib/executive-lifecycle";
import { registerLifecycleActions } from "../domains/lifecycle/register-lifecycle-actions";
import { registerProductActions } from "../domains/products";
import { registerExecutiveActionCreate } from "../domains/executive-actions";
import { registerCompanyActions } from "../domains/company";
import { registerTaskActions } from "../domains/tasks";
import { registerQuoteActions } from "../domains/quotes";
import { registerInvoiceActions } from "../domains/invoices";
import { registerPaymentActions } from "../domains/payments";
import { registerSupplierActions } from "../domains/suppliers";
import { registerOrderActions } from "../domains/orders";
import { registerDeliveryActions } from "../domains/deliveries";
import { registerStockActions } from "../domains/stock";
import { registerProductionActions } from "../domains/production";
import { registerIntegrationActions } from "../domains/integrations";
import { registerCollectionActions } from "../domains/collections";
import { registerFieldVisitActions } from "../domains/field-visits";
import { registerFinancialAccountActions } from "../domains/financial-accounts";

/**
 * Server-side production composition root for the Domain Action Execution
 * Runtime. This is the one place domain handlers get wired into a concrete,
 * runnable ExecutionRuntime for the running application.
 *
 * The generic execution/index.ts barrel stays domain-agnostic on purpose —
 * it must not know Customers/Voice/Chat exist. Anything that needs a
 * production-ready runtime (future server Action API routes) imports
 * productionExecutionRuntime from here instead of constructing its own.
 *
 * Registering a new domain's handlers into production means adding one
 * registerXActions(handlerRegistry) call below — nothing else changes.
 */
const handlerRegistry = createInMemoryHandlerRegistry();
registerCustomerActions(handlerRegistry);
registerLifecycleActions(handlerRegistry);
registerProductActions(handlerRegistry);
registerExecutiveActionCreate(handlerRegistry);
registerCompanyActions(handlerRegistry);
registerTaskActions(handlerRegistry);
registerQuoteActions(handlerRegistry);
registerInvoiceActions(handlerRegistry);
registerPaymentActions(handlerRegistry);
registerSupplierActions(handlerRegistry);
registerOrderActions(handlerRegistry);
registerDeliveryActions(handlerRegistry);
registerStockActions(handlerRegistry);
registerProductionActions(handlerRegistry);
registerIntegrationActions(handlerRegistry);
registerCollectionActions(handlerRegistry);
registerFieldVisitActions(handlerRegistry);
registerFinancialAccountActions(handlerRegistry);

export const productionExecutionRuntime: ExecutionRuntime = createExecutionRuntime({
  handlerRegistry,
  idempotencyStore: createDurableIdempotencyStore({ prisma }),
  lifecycleSink: executiveLifecycleRegistry.publish,
});
