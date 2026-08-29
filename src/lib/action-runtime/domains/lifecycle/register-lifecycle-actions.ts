import type { ActionExecutionEnvelope, ActionHandlerRegistry, HandlerResult } from "../../execution";
import { updateCollectionActionLifecycle } from "@/lib/core/collection-actions/collection-action.repository";
import { updateQuoteLifecycle } from "@/lib/core/quotes/quote.repository";
import { acceptQuoteWithLatestNegotiatedTerms } from "@/lib/core/quotes/quote.service";
import { completeExecutiveAction } from "@/lib/core/executive-actions/executive-action-engine.service";

export function registerLifecycleActions(registry: ActionHandlerRegistry): void {
  registry.registerHandler("collection.set_lifecycle", handleCollectionLifecycle);
  registry.registerHandler("quote.set_lifecycle", handleQuoteLifecycle);
  registry.registerHandler("executive_action.complete", handleExecutiveActionCompletion);
}

async function handleCollectionLifecycle(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const id = requireBoundEntity(envelope, "collection_action", "collectionActionId");
  const status = envelope.input.status;
  if (status !== "IN_PROGRESS" && status !== "DONE" && status !== "DISMISSED") {
    return failure("Invalid collection lifecycle status.");
  }
  const result = await updateCollectionActionLifecycle({
    id,
    organizationId: envelope.executionContext.organizationId,
    status,
  });
  return result ? success(envelope, id) : failure("Collection action was not found in this organization.");
}

async function handleQuoteLifecycle(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const id = requireBoundEntity(envelope, "quote", "quoteId");
  const status = envelope.input.status;
  if (status !== "WON" && status !== "LOST" && status !== "CANCELLED") {
    return failure("Invalid quote lifecycle status.");
  }
  const now = new Date();
  const result = status === "WON" ? await acceptQuoteWithLatestNegotiatedTerms({ quoteId: id, organizationId: envelope.executionContext.organizationId, wonAt: now }) : await updateQuoteLifecycle({
    id,
    organizationId: envelope.executionContext.organizationId,
    status,
    ...(status === "LOST" ? { lostAt: now } : {}),
  });
  return result ? success(envelope, id) : failure("Quote was not found in this organization.");
}

async function handleExecutiveActionCompletion(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const id = requireBoundEntity(envelope, "executive_action", "executiveActionId");
  const outcomeStatus = envelope.input.outcomeStatus;
  if (outcomeStatus !== "SUCCESS" && outcomeStatus !== "PARTIAL" && outcomeStatus !== "FAILED" && outcomeStatus !== "UNKNOWN") {
    return failure("Invalid executive action outcome.");
  }
  const resultSummary = typeof envelope.input.resultSummary === "string"
    ? envelope.input.resultSummary
    : undefined;
  const result = await completeExecutiveAction({
    id,
    organizationId: envelope.executionContext.organizationId,
    outcomeStatus,
    resultSummary,
  });
  return result ? success(envelope, id) : failure("Executive action was not found in this organization.");
}

function requireBoundEntity(
  envelope: ActionExecutionEnvelope,
  entityType: string,
  inputKey: string,
): string {
  const inputId = envelope.input[inputKey];
  if (
    typeof inputId !== "string"
    || envelope.entityRef?.entityType !== entityType
    || envelope.entityRef.entityId !== inputId
  ) {
    throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  }
  return inputId;
}

function success(envelope: ActionExecutionEnvelope, entityId: string): HandlerResult {
  return {
    status: "SUCCESS",
    entityRef: { entityType: envelope.entityRef!.entityType, entityId },
    resultSummary: "Lifecycle mutation applied through Action Runtime.",
  };
}

function failure(errorMessage: string): HandlerResult {
  return { status: "FAILURE", errorMessage };
}
