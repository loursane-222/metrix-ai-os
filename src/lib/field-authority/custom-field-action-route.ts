import { randomUUID } from "crypto";
import { ok } from "@/lib/api/response";
import { ApiValidationError, readJsonObject, requiredIdempotencyKey } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { cancelCustomFieldApproval, executeApprovedCustomFieldAction, requestCustomFieldApproval, type CustomFieldActionName } from "@/lib/action-runtime/gateway/custom-field-gateway";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { normalizeCustomFieldKey, validateCustomFieldDefinition, type CustomFieldDefinitionDraft } from "./custom-field.service";
import type { TargetEntityRef } from "@/lib/action-runtime/policy";

const CREATE_KEYS = new Set(["module", "entityType", "key", "label", "description", "valueType", "required", "options", "defaultValue", "validation", "searchable", "filterable", "reportable", "uiSection", "uiOrder"]);
const UPDATE_KEYS = new Set(["label", "description", "required", "options", "defaultValue", "validation", "searchable", "filterable", "reportable", "uiSection", "uiOrder"]);
function strictInput(raw: unknown, actionName: CustomFieldActionName, definitionId?: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiValidationError("input must be an object.");
  const value = raw as Record<string, unknown>; const allowed = actionName === "custom_field.create" ? CREATE_KEYS : actionName === "custom_field.update_definition" ? UPDATE_KEYS : new Set<string>();
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new ApiValidationError("input contains unsupported fields.");
  if (actionName === "custom_field.create") {
    const normalized = { ...value, module: "customers", entityType: "customer", key: normalizeCustomFieldKey(String(value.key ?? value.label ?? "")) } as unknown as CustomFieldDefinitionDraft;
    const errors = validateCustomFieldDefinition(normalized); if (errors.length) throw new ApiValidationError(errors.join(" ")); return normalized as unknown as Record<string, unknown>;
  }
  if (!definitionId) throw new ApiValidationError("definitionId is required.");
  return { definitionId, ...value };
}
export async function handleCustomFieldActionRoute(request: Request, actionName: CustomFieldActionName, definitionId?: string): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies(); const body = await readJsonObject(request); const phase = body.phase;
    if (!new Set(["REQUEST", "CONFIRM", "CANCEL"]).has(String(phase))) throw new ApiValidationError("phase is invalid.");
    if (phase === "CANCEL") { if (typeof body.approvalId !== "string") throw new ApiValidationError("approvalId is required."); cancelCustomFieldApproval(authContext, body.approvalId); return ok({ status: "CANCELLED" }); }
    const input = strictInput(body.input, actionName, definitionId); const entityRef: TargetEntityRef | undefined = definitionId ? { entityType: "custom_field_definition", entityId: definitionId } : undefined;
    if (phase === "REQUEST") { const approval = requestCustomFieldApproval(authContext, actionName, input, entityRef); return ok({ status: "APPROVAL_REQUIRED", approval: { approvalId: approval.approvalId, expiresAt: approval.expiresAt }, preview: input }); }
    if (typeof body.approvalId !== "string") throw new ApiValidationError("approvalId is required.");
    const execution = await executeApprovedCustomFieldAction({ authContext, actionName, input, entityRef, approvalId: body.approvalId, idempotencyKey: requiredIdempotencyKey(request), correlationId: request.headers.get("X-Correlation-Id")?.trim() || randomUUID() });
    return ok({ status: "SUCCEEDED", execution });
  } catch (error) { return mapExecutionErrorToHttpResponse(error); }
}
