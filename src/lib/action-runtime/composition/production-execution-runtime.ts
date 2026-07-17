import { createExecutionRuntime, createInMemoryHandlerRegistry, ExecutionRuntime } from "../execution";
import { registerCustomerActions } from "../domains/customers";

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

export const productionExecutionRuntime: ExecutionRuntime = createExecutionRuntime({ handlerRegistry });
