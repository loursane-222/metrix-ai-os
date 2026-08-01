import type { AuthContext } from "@/lib/auth/context/auth-context.types";

import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import type { ActionExecutionRequest, ExecutionResult } from "../execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest } from "./execution-request";

export type ExecuteQuoteSendGatewayInput = {
  authContext: AuthContext;
  quoteId: string;
  idempotencyKey: string;
  correlationId: string;
};

export type ExecuteQuoteSendGatewayDeps = {
  executeAction: (request: ActionExecutionRequest) => Promise<ExecutionResult>;
};

const defaultDeps: ExecuteQuoteSendGatewayDeps = {
  executeAction: (request) => productionExecutionRuntime.executeAction(request),
};

/** Framework-agnostic "Teklifi müşteriye gönder" server gateway — quote.send'in tek giriş noktası. */
export async function executeQuoteSendGateway(
  input: ExecuteQuoteSendGatewayInput,
  deps: ExecuteQuoteSendGatewayDeps = defaultDeps,
): Promise<ExecutionResult> {
  const entityRef = { entityType: "quote", entityId: input.quoteId };
  const executionContext = buildExecutionContext(input.authContext);

  const executionRequest = buildActionExecutionRequest({
    actionName: "quote.send",
    input: { quoteId: input.quoteId },
    executionContext,
    entityRef,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    runtimeRiskContext: { changedFields: ["status"], externalSideEffect: false, reversibilityClass: "CORRECTABLE" },
  });

  return deps.executeAction(executionRequest);
}
