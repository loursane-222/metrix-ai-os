import { createFieldVisit, linkFieldVisitOutcome, listFieldVisitsForOrganization } from "./field-visit.repository";
import type { CreateFieldVisitInput, FieldVisitResult, ListFieldVisitsInput } from "./field-visit.types";

function assert(value: string | undefined, field: string): void {
  if (!value?.trim()) throw new Error(`${field} is required.`);
}

export function createNewFieldVisit(input: CreateFieldVisitInput): Promise<FieldVisitResult> {
  assert(input.organizationId, "organizationId");
  assert(input.repUserId, "repUserId");
  assert(input.customerNameRaw, "customerNameRaw");
  return createFieldVisit(input);
}

export async function linkFieldVisitOutcomeById(
  id: string,
  organizationId: string,
  outcome: { relatedOrderId?: string; relatedPaymentId?: string },
): Promise<void> {
  assert(id, "id");
  assert(organizationId, "organizationId");
  await linkFieldVisitOutcome(id, organizationId, outcome);
}

export function listFieldVisits(input: ListFieldVisitsInput): Promise<FieldVisitResult[]> {
  assert(input.organizationId, "organizationId");
  return listFieldVisitsForOrganization(input);
}
