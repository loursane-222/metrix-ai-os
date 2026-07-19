import { ok } from "@/lib/api/response";
import { ApiValidationError, isRecord, readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveCustomerCreatePlan } from "@/lib/customers/customer-create-conversation-planner";
import { generateCustomerCreatePlanText } from "@/lib/customers/customer-create-conversation-ai-adapter";
import { CUSTOMER_CREATE_PLAN_FIELDS, type CustomerCreatePlanFields } from "@/lib/customers/customer-create-conversation-plan";
import type { CustomerCreatePendingContext } from "@/lib/customers/customer-create-conversation-planner";
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuthContextFromCookies();
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
    return ok({ plan: await resolveCustomerCreatePlan({ utterance, pendingContext, generateText: generateCustomerCreatePlanText }) });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
