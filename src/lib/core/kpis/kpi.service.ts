import { ApiValidationError } from "@/lib/api/validation";

import { createKpiDefinition, findKpiDefinitionById, listKpiDefinitionsForOrganization } from "./kpi.repository";

import type { CreateKpiDefinitionInput, KpiDefinitionResult, KpiDefinitionWithGoalSnapshot, ListKpiDefinitionsInput } from "./kpi.types";

export async function createNewKpiDefinition(input: CreateKpiDefinitionInput): Promise<KpiDefinitionResult> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.key, "key");
  assertNonEmpty(input.label, "label");
  assertNonEmpty(input.scope, "scope");
  assertNonEmpty(input.period, "period");
  assertNonEmpty(input.createdByType, "createdByType");
  assertNonEmpty(input.rationale, "rationale");
  return createKpiDefinition(input);
}

export async function listKpiDefinitions(input: ListKpiDefinitionsInput): Promise<KpiDefinitionWithGoalSnapshot[]> {
  assertNonEmpty(input.organizationId, "organizationId");
  return listKpiDefinitionsForOrganization(input);
}

export async function findKpiById(id: string, organizationId: string): Promise<KpiDefinitionResult | null> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");
  return findKpiDefinitionById(id, organizationId);
}

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (!value || value.trim().length === 0) throw new ApiValidationError(`${field} is required.`);
}
