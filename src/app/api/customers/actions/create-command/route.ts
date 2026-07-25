import { ok } from "@/lib/api/response";
import { ApiValidationError, isRecord, readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveCustomerCreatePlan } from "@/lib/customers/customer-create-conversation-planner";
import { generateCustomerCreatePlanText } from "@/lib/customers/customer-create-conversation-ai-adapter";
import { CUSTOMER_CREATE_PLAN_FIELDS, type CustomerCreatePlanFields } from "@/lib/customers/customer-create-conversation-plan";
import type { CustomerCreatePendingContext } from "@/lib/customers/customer-create-conversation-planner";
import { randomUUID } from "crypto";
import { captureCustomerPlan } from "@/lib/customers/customer-live-capture.service";
import { emitCustomerLifecycle, resolveCustomerCorrelationId } from "@/lib/conversation-extensions/conversation-lifecycle-telemetry";
export async function POST(request: Request): Promise<Response> {
  try {
    const correlationId = resolveCustomerCorrelationId(request.headers.get("X-Correlation-Id"));
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    if (Object.keys(body).some((key) => !["utterance", "pendingContext"].includes(key))) throw new ApiValidationError("Request contains an unsupported field.");
    const utterance = requiredString(body, "utterance");
    if (utterance.length > 4_000) throw new ApiValidationError("utterance is too long.");
    let pendingContext: CustomerCreatePendingContext = null;
    if (body.pendingContext !== undefined && body.pendingContext !== null) {
      if (!isRecord(body.pendingContext) || Object.keys(body.pendingContext).some((key) => !["lifecycle", "fields", "missingFields"].includes(key))) throw new ApiValidationError("pendingContext is invalid.");
      if (!["OPENING", "COLLECTING", "READY"].includes(String(body.pendingContext.lifecycle)) || !isRecord(body.pendingContext.fields) || !Array.isArray(body.pendingContext.missingFields)) throw new ApiValidationError("pendingContext is invalid.");
      const fields: CustomerCreatePlanFields = {};
      for (const [key, value] of Object.entries(body.pendingContext.fields)) {
        if (!(CUSTOMER_CREATE_PLAN_FIELDS as readonly string[]).includes(key) || !["string", "number", "boolean"].includes(typeof value)) throw new ApiValidationError("pendingContext fields contain an unsupported field.");
        if (typeof value === "string" && value.length > 500) throw new ApiValidationError("pendingContext field value is too long.");
        fields[key as keyof CustomerCreatePlanFields] = value as string | number | boolean;
      }
      if (body.pendingContext.missingFields.some((field) => field !== "displayName") || new Set(body.pendingContext.missingFields).size !== body.pendingContext.missingFields.length) throw new ApiValidationError("pendingContext missingFields is invalid.");
      pendingContext = { lifecycle: body.pendingContext.lifecycle as NonNullable<CustomerCreatePendingContext>["lifecycle"], fields, missingFields: body.pendingContext.missingFields as Array<"displayName"> };
    }
    const plan = await resolveCustomerCreatePlan({ utterance, pendingContext, generateText: generateCustomerCreatePlanText });
    const capture = plan.kind === "CREATE_PLAN" && Object.keys(plan.fields).length ? await captureCustomerPlan({ authContext: auth, plan, channel: "text", captureId: randomUUID(), correlationId }).catch((error) => { console.warn("[UniversalCapture] planner-source activation failed:", error); return null; }) : null;
    const captureResult = isRecord(capture) && isRecord(capture.result) ? capture.result : null;
    emitCustomerLifecycle("CustomerPlanner", {
      event: "planner_resolved",
      correlationId,
      planKind: plan.kind,
      operation: plan.kind === "CREATE_PLAN" ? plan.operation ?? "UNSPECIFIED" : "NONE",
      intent: plan.kind === "CREATE_PLAN" ? plan.intent : "NONE",
      semanticStage: plan.kind === "CREATE_PLAN" ? plan.semantic?.stage ?? "UNKNOWN" : "NONE",
      semanticSource: plan.kind === "CREATE_PLAN" ? plan.semantic?.source ?? "UNKNOWN" : "NONE",
      semanticConfidence: plan.kind === "CREATE_PLAN" ? plan.semantic?.confidence ?? "UNKNOWN" : "NONE",
      activeWorkflow: plan.kind === "CREATE_PLAN" ? plan.semantic?.activeWorkflow ?? Boolean(pendingContext) : Boolean(pendingContext),
      explicitCommit: plan.kind === "CREATE_PLAN" ? plan.explicitCommit : false,
      hasEntityReference: plan.kind === "CREATE_PLAN" && Boolean(plan.entityReference),
      fieldCount: plan.kind === "CREATE_PLAN" ? Object.keys(plan.fields).length : 0,
      hasCapture: capture !== null,
      captureInteraction: captureResult && typeof captureResult.userInteraction === "string" ? captureResult.userInteraction : "NONE",
      captureOperationCount: captureResult && Array.isArray(captureResult.draftOperations) ? captureResult.draftOperations.length : 0,
      plannerFallbackUsed: plan.kind === "CREATE_PLAN" ? plan.semantic?.fallbackUsed ?? false : false,
    });
    return ok({ plan, capture });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
