import { createExecutiveAction } from "@/lib/core/executive-actions/executive-action-engine.service";
import { executiveActionCancelHandler } from "./executive-action-cancel-handler";
import type { ActionExecutionEnvelope, ActionHandlerRegistry, HandlerResult } from "../../execution";

export function registerExecutiveActionCreate(registry: ActionHandlerRegistry): void {
  registry.registerHandler("executive_action.create", handleExecutiveActionCreate);
  if (!registry.hasHandler("executive_action.cancel")) registry.registerHandler("executive_action.cancel", executiveActionCancelHandler);
}

async function handleExecutiveActionCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const candidateId = requiredString(envelope.input.candidateId, "candidateId");
  const action = await createExecutiveAction({
    organizationId: envelope.executionContext.organizationId,
    sourceType: "MANUAL",
    sourceId: candidateId,
    title: requiredString(envelope.input.title, "title"),
    reason: requiredString(envelope.input.reason, "reason"),
    ownerType: envelope.input.ownerType === "USER" || envelope.input.ownerType === "PERSON"
      ? envelope.input.ownerType
      : "UNASSIGNED",
    ownerId: typeof envelope.input.ownerId === "string" ? envelope.input.ownerId : null,
    dueDate: typeof envelope.input.dueDate === "string" ? new Date(envelope.input.dueDate) : null,
  });
  return {
    status: "SUCCESS",
    entityRef: { entityType: "executive_action", entityId: action.id },
    resultSummary: "Canonical executive action created.",
    metadata: { candidateId },
    domainEvents: [],
    sideEffects: [],
  };
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
