import { ok } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { listCustomerCustomFields } from "@/lib/field-authority/custom-field.service";
import { customerCustomDefinitionToField } from "@/lib/customers/customer-field-registry";
export async function GET(): Promise<Response> { try { const auth = await requireAuthContextFromCookies(); const records = await listCustomerCustomFields(auth.organization.id); return ok({ fields: records.map((record) => customerCustomDefinitionToField({ id: record.id, organizationId: record.organizationId, key: record.key, label: record.label, description: record.description, valueType: record.valueType, required: record.required, options: record.optionsJson, active: record.active })) }); } catch (error) { return mapExecutionErrorToHttpResponse(error); } }
