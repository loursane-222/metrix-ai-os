import { ApiValidationError } from "@/lib/api/validation";

import { computeKpiCurrentValue } from "./kpi-calculation-engine.service";
import { deriveKpiSourceDomain, formatKpiComputedValue, formatKpiSourceDomains, parseKpiCalculationMethod, SUPPORTED_KPI_CALCULATION_METHODS } from "./kpi-calculation.types";
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
  const method = parseKpiCalculationMethod(input.calculationMethod);
  if (method === null) {
    throw new ApiValidationError(`calculationMethod is not a supported formula. Desteklenen türler: ${SUPPORTED_KPI_CALCULATION_METHODS.join(", ")}.`);
  }
  return createKpiDefinition({ ...input, sourceDomainsJson: { domains: [deriveKpiSourceDomain(method)] } });
}

export async function listKpiDefinitions(input: ListKpiDefinitionsInput): Promise<KpiDefinitionWithGoalSnapshot[]> {
  assertNonEmpty(input.organizationId, "organizationId");
  const rows = await listKpiDefinitionsForOrganization(input);
  const now = new Date();
  return Promise.all(rows.map(async (row) => {
    const method = parseKpiCalculationMethod(row.calculationMethod);
    const currentValue = method === null
      ? UNPARSEABLE_COMPUTED_VALUE
      : await computeKpiCurrentValue(input.organizationId, method, row.period, now);
    return { ...row, currentValue, currentValueLabel: formatKpiComputedValue(currentValue), sourceDomainsLabel: formatKpiSourceDomains(row.sourceDomainsJson) };
  }));
}

// Defensive fallback for KPI rows created before calculationMethod
// validation existed (see createNewKpiDefinition) — reported honestly as
// unavailable rather than throwing and breaking the whole list.
const UNPARSEABLE_COMPUTED_VALUE = Object.freeze({
  available: false, value: null, unit: "COUNT", measuredAt: new Date(0).toISOString(), sourceDomain: "finance",
  calculationMethodLabel: "Tanınmayan hesaplama yöntemi", confidence: "UNAVAILABLE", verificationStatus: "NO_DATA",
  note: "Bu KPI'nın calculationMethod alanı desteklenen bir formülle eşleşmiyor.",
} as const);

export async function findKpiById(id: string, organizationId: string): Promise<KpiDefinitionResult | null> {
  assertNonEmpty(id, "id");
  assertNonEmpty(organizationId, "organizationId");
  return findKpiDefinitionById(id, organizationId);
}

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (!value || value.trim().length === 0) throw new ApiValidationError(`${field} is required.`);
}
