import type { AuthContext } from "@/lib/auth/context/auth-context.types";
import { productionExecutionRuntime } from "../composition/production-execution-runtime";
import { buildExecutionContext } from "./execution-context";
import { buildActionExecutionRequest } from "./execution-request";

export function executeTaskCompleteGateway(input: { authContext: AuthContext; taskId: string; idempotencyKey: string; correlationId: string }) {
  return productionExecutionRuntime.executeAction(buildActionExecutionRequest({ actionName: "task.complete", input: { taskId: input.taskId }, entityRef: { entityType: "task", entityId: input.taskId }, executionContext: buildExecutionContext(input.authContext), idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, runtimeRiskContext: { externalSideEffect: false, reversibilityClass: "REVERSIBLE" } }));
}
