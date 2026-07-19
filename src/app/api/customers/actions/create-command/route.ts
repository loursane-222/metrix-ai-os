import { ok } from "@/lib/api/response";
import { ApiValidationError, isRecord, readJsonObject, requiredString } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { resolveCustomerCreatePlan } from "@/lib/customers/customer-create-conversation-planner";
import { generateCustomerCreatePlanText } from "@/lib/customers/customer-create-conversation-ai-adapter";
import { CUSTOMER_CREATE_PLAN_FIELDS, type CustomerCreatePlanFields } from "@/lib/customers/customer-create-conversation-plan";
export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuthContextFromCookies();
    const body = await readJsonObject(request); const utterance = requiredString(body, "utterance");
    if (utterance.length > 4_000) throw new ApiValidationError("utterance is too long.");
    const pendingFields: CustomerCreatePlanFields = {};
    if (body.pendingFields !== undefined) {
      if (!isRecord(body.pendingFields)) throw new ApiValidationError("pendingFields must be an object.");
      for (const [key, value] of Object.entries(body.pendingFields)) {
        if (!(CUSTOMER_CREATE_PLAN_FIELDS as readonly string[]).includes(key) || typeof value !== "string") throw new ApiValidationError("pendingFields contains an unsupported field.");
        if (value.length > 500) throw new ApiValidationError("pendingFields value is too long.");
        pendingFields[key as keyof CustomerCreatePlanFields] = value;
      }
    }
    return ok({ plan: await resolveCustomerCreatePlan({ utterance, pendingFields, generateText: generateCustomerCreatePlanText }) });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
