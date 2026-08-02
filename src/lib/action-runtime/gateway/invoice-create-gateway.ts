import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import type { ActionExecutionRequest, ExecutionResult } from "../execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest } from "./execution-request";

import type { CreateInvoiceBody } from "@/lib/invoices/invoices-client";
export type InvoiceCreateActionInput = CreateInvoiceBody;
export async function executeInvoiceCreateGateway(input: { authContext: AuthContext; invoice: InvoiceCreateActionInput; idempotencyKey: string; correlationId: string }, deps: { executeAction(request: ActionExecutionRequest): Promise<ExecutionResult> } = productionExecutionRuntime) {
  return deps.executeAction(buildActionExecutionRequest({ actionName: "invoice.create", input: input.invoice, executionContext: buildExecutionContext(input.authContext), idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "REVERSIBLE" } }));
}
