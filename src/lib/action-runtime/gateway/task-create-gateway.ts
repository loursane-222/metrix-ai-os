import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import type { ActionExecutionRequest, ExecutionResult } from "../execution";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest } from "./execution-request";

import type { CreateTaskBody } from "@/lib/tasks/tasks-client";
export type TaskCreateActionInput = CreateTaskBody;
export async function executeTaskCreateGateway(input: { authContext: AuthContext; task: TaskCreateActionInput; idempotencyKey: string; correlationId: string }, deps: { executeAction(request: ActionExecutionRequest): Promise<ExecutionResult> } = productionExecutionRuntime) {
  return deps.executeAction(buildActionExecutionRequest({ actionName: "task.create", input: input.task, executionContext: buildExecutionContext(input.authContext), idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "REVERSIBLE" } }));
}
