import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { resolveExecutionPermissions } from "@/lib/action-runtime/gateway/execution-context";
import { mapExecutionErrorToHttpResponse } from "@/lib/action-runtime/gateway/execution-http-errors";
import { CUSTOMER_BUILT_IN_FIELDS, customerCustomDefinitionToField } from "@/lib/customers/customer-field-registry";
import { detectCustomerDuplicates } from "@/lib/customers/customer-duplicate-detection";
import { canAccessField, mergeCustomFieldDefinitions } from "@/lib/field-authority/field-authority";
import { listCustomerCustomFields } from "@/lib/field-authority/custom-field.service";
import { CUSTOMER_DOCUMENT_MIME_TYPES, customerDocumentFieldExtractor } from "@/lib/field-authority/customer-document-field-extractor";
import { validateStructuredExtractionPayload, type StructuredFieldExtractionAdapter } from "@/lib/field-authority/structured-field-ingestion";

const MAX_BYTES = 10 * 1024 * 1024;
function safeFilename(value: string) { const name = value.normalize("NFKC").replace(/[\\/\0\r\n]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120); return name && name !== "." && name !== ".." ? name : "document"; }
export async function extractCustomerDocument(request: Request, deps: { extractor: StructuredFieldExtractionAdapter } = { extractor: customerDocumentFieldExtractor }): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies(); const contentLength = Number(request.headers.get("content-length") ?? 0); if (contentLength > MAX_BYTES + 1_000_000) return fail("Dosya 10 MB sinirini asiyor.", 413);
    const form = await request.formData(); const entry = form.get("file"); if (!(entry instanceof File)) return fail("file is required.", 400);
    if (!CUSTOMER_DOCUMENT_MIME_TYPES.includes(entry.type as (typeof CUSTOMER_DOCUMENT_MIME_TYPES)[number])) return fail("Desteklenen biçimler JPEG, PNG, WebP ve PDF'dir.", 415);
    if (!entry.size || entry.size > MAX_BYTES) return fail("Dosya 10 MB sinirini asiyor.", 413);
    const filename = safeFilename(entry.name); const sourceId = randomUUID(); const bytes = new Uint8Array(await entry.arrayBuffer());
    const custom = await listCustomerCustomFields(auth.organization.id); const registry = mergeCustomFieldDefinitions(CUSTOMER_BUILT_IN_FIELDS, custom.map((record) => customerCustomDefinitionToField({ id: record.id, organizationId: record.organizationId, key: record.key, label: record.label, description: record.description, valueType: record.valueType, required: record.required, options: record.optionsJson, metadata: record.validationJson, defaultValue: record.defaultValueJson, active: record.active })));
    const permissions = resolveExecutionPermissions(auth.membership.role); const safeFields = registry.filter((field) => canAccessField(field, { operation: "create", permissions }).writable);
    const raw = await deps.extractor.extract({ sourceId, filename, mediaType: entry.type, bytes, safeFields: safeFields.map(({ fieldId, label, valueType }) => ({ fieldId, label, valueType })) });
    const extraction = validateStructuredExtractionPayload(raw, safeFields); const candidateValues = Object.fromEntries(extraction.candidates.map((candidate) => [candidate.fieldId, candidate.normalizedValue])); const duplicates = await detectCustomerDuplicates(auth.organization.id, candidateValues);
    return ok({ lifecycle: "REVIEW_REQUIRED", source: { sourceId, filename, mediaType: entry.type, size: entry.size }, ...extraction, duplicates, requiresExplicitCommit: true, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() });
  } catch (error) { if (error instanceof Error && error.message.startsWith("DOCUMENT_PROVIDER_")) return fail("Belge güvenli biçimde işlenemedi.", 502); return mapExecutionErrorToHttpResponse(error); }
}
export async function POST(request: Request) { return extractCustomerDocument(request); }
