import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import type { ActionExecutionRequest, ExecutionResult } from "../execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest } from "./execution-request";

export type ExecuteInvoiceSendGatewayInput = {
  authContext: AuthContext;
  invoiceId: string;
  idempotencyKey: string;
  correlationId: string;
};

export async function executeInvoiceSendGateway(
  input: ExecuteInvoiceSendGatewayInput,
  executeAction: (request: ActionExecutionRequest) => Promise<ExecutionResult> = (request) => productionExecutionRuntime.executeAction(request),
): Promise<ExecutionResult> {
  return executeAction(buildActionExecutionRequest({
    actionName: "invoice.send",
    input: { invoiceId: input.invoiceId },
    executionContext: buildExecutionContext(input.authContext),
    entityRef: { entityType: "invoice", entityId: input.invoiceId },
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    runtimeRiskContext: { changedFields: ["status"], externalSideEffect: false, reversibilityClass: "CORRECTABLE" },
  }));
}
