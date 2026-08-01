import type { AuthContext } from "@/lib/auth/context/auth-context.types";

import { buildQuoteUpdateRuntimeRiskContext } from "../domains/quotes";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import type { ActionExecutionRequest, ExecutionResult } from "../execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest } from "./execution-request";

export type ExecuteQuoteUpdateGatewayInput = {
  authContext: AuthContext;
  quoteId: string;
  patch: Record<string, unknown>;
  expectedVersion: string;
  idempotencyKey: string;
  correlationId: string;
};

export type ExecuteQuoteUpdateGatewayDeps = {
  executeAction: (request: ActionExecutionRequest) => Promise<ExecutionResult>;
};

const defaultDeps: ExecuteQuoteUpdateGatewayDeps = {
  executeAction: (request) => productionExecutionRuntime.executeAction(request),
};

/** Framework-agnostic Offer Edit server gateway — bkz. customer-update-gateway.ts aynı desen. */
export async function executeQuoteUpdateGateway(
  input: ExecuteQuoteUpdateGatewayInput,
  deps: ExecuteQuoteUpdateGatewayDeps = defaultDeps,
): Promise<ExecutionResult> {
  const entityRef = { entityType: "quote", entityId: input.quoteId };
  const executionContext = buildExecutionContext(input.authContext);
  const runtimeRiskContext = buildQuoteUpdateRuntimeRiskContext(input.patch);

  const executionRequest = buildActionExecutionRequest({
    actionName: "quote.update",
    input: {
      quoteId: input.quoteId,
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
