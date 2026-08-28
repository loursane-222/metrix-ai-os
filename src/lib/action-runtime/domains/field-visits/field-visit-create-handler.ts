import { createNewFieldVisit } from "@/lib/core/field-visits/field-visit.service";
import type { FieldVisitRequestType } from "@/lib/core/field-visits/field-visit.types";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

const VALID_REQUEST_TYPES: readonly FieldVisitRequestType[] = ["DISPLAY_REQUEST", "SAMPLE_REQUEST", "OTHER"];

export async function handleFieldVisitCreate(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const customerNameRaw = requiredString(envelope.input.customerNameRaw, "customerNameRaw");
  const startAtInput = requiredString(envelope.input.startAt, "startAt");
  const startAt = new Date(startAtInput);
  if (Number.isNaN(startAt.getTime())) throw new Error("startAt must be a valid date.");
  const endAtInput = optionalString(envelope.input.endAt);
  const endAt = endAtInput ? new Date(endAtInput) : undefined;
  if (endAt && Number.isNaN(endAt.getTime())) throw new Error("endAt must be a valid date.");
  const requestTypes = readRequestTypes(envelope.input.requestTypes);
  const organizationId = envelope.executionContext.organizationId;

  // CRITICAL side effect — its failure is the handler's failure.
  const visit = await createNewFieldVisit({
    organizationId,
    repUserId: envelope.executionContext.actorId,
    customerId: optionalString(envelope.input.customerId) ?? null,
    customerNameRaw,
    contactNameRaw: optionalString(envelope.input.contactNameRaw) ?? null,
    startAt,
    endAt,
    notes: optionalString(envelope.input.notes) ?? null,
    requestTypes,
    unresolvedIntent: optionalString(envelope.input.unresolvedIntent) ?? null,
    relatedOrderId: optionalString(envelope.input.relatedOrderId) ?? null,
    relatedPaymentId: optionalString(envelope.input.relatedPaymentId) ?? null,
  });

  // A plain visit-with-notes shouldn't page anyone — only a real request
  // (teşhir/numune) needs a human to actually go fulfill it.
  if (requestTypes.length > 0) {
    await notifyWithOwnerFanout({
      organizationId,
      actorUserId: envelope.executionContext.actorId,
      type: "field_visit.request_raised",
      title: "Sahadan yeni bir talep geldi",
      body: `${customerNameRaw}: ${requestTypes.map(requestTypeLabel).join(", ")}`,
      entityType: "FieldVisit",
      entityId: visit.id,
    });
  }

  return {
    status: "SUCCESS",
    entityRef: { entityType: "field_visit", entityId: visit.id },
    resultSummary: "field_visit.create completed.",
    metadata: { fieldVisitId: visit.id, customerId: visit.customerId, requestTypes },
    domainEvents: [],
    sideEffects: [],
  };
}

function requestTypeLabel(type: FieldVisitRequestType): string {
  if (type === "DISPLAY_REQUEST") return "teşhir talebi";
  if (type === "SAMPLE_REQUEST") return "numune talebi";
  return "diğer talep";
}

function readRequestTypes(value: unknown): FieldVisitRequestType[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is FieldVisitRequestType => typeof item === "string" && (VALID_REQUEST_TYPES as readonly string[]).includes(item));
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
