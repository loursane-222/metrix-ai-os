import type { AuthContext } from "@/lib/auth/context/auth-context.types";

import { buildCustomerUpdateRuntimeRiskContext } from "../domains/customers";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import type { ActionExecutionRequest, ExecutionResult } from "../execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest } from "./execution-request";

export type ExecuteCustomerUpdateGatewayInput = {
  authContext: AuthContext;
  customerId: string;
  patch: Record<string, unknown>;
  expectedVersion: string;
  idempotencyKey: string;
  correlationId: string;
};

export type ExecuteCustomerUpdateGatewayDeps = {
  executeAction: (request: ActionExecutionRequest) => Promise<ExecutionResult>;
};

const defaultDeps: ExecuteCustomerUpdateGatewayDeps = {
  executeAction: (request) => productionExecutionRuntime.executeAction(request),
};

/**
 * Framework-agnostic Customers Edit server gateway. Builds the
 * ActionExecutionRequest for customer.update entirely from trusted server
 * inputs (AuthContext, the route's own customerId, the body's patch/
 * expectedVersion) and delegates to an injectable executeAction — the
 * Next.js route wrapper stays a thin HTTP adapter around this function, and
 * tests can inject a fresh, isolated ExecutionRuntime instead of the shared
 * production singleton (whose idempotency/operation/audit/outbox stores are
 * in-memory and must not leak state across tests).
 */
export async function executeCustomerUpdateGateway(
  input: ExecuteCustomerUpdateGatewayInput,
  deps: ExecuteCustomerUpdateGatewayDeps = defaultDeps,
): Promise<ExecutionResult> {
  const entityRef = { entityType: "customer", entityId: input.customerId };
  const executionContext = buildExecutionContext(input.authContext);
  const runtimeRiskContext = buildCustomerUpdateRuntimeRiskContext(input.patch);

  const executionRequest = buildActionExecutionRequest({
    actionName: "customer.update",
    input: {
      customerId: input.customerId,
      expectedVersion: input.expectedVersion,
      patch: input.patch,
    },
    executionContext,
    entityRef,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    runtimeRiskContext,
  });

  return deps.executeAction(executionRequest);
}
