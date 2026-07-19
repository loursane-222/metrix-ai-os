import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import type { ActionExecutionRequest, ExecutionResult } from "../execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest } from "./execution-request";

export type CustomerCreateActionInput = { displayName: string; legalName?: string; phone?: string; email?: string; metrixNote?: string };
export async function executeCustomerCreateGateway(input: { authContext: AuthContext; customer: CustomerCreateActionInput; idempotencyKey: string; correlationId: string }, deps: { executeAction(request: ActionExecutionRequest): Promise<ExecutionResult> } = productionExecutionRuntime) {
  return deps.executeAction(buildActionExecutionRequest({ actionName: "customer.create", input: input.customer, executionContext: buildExecutionContext(input.authContext), idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "REVERSIBLE" } }));
}
