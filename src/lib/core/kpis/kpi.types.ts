import type { KpiDefinition, Prisma } from "@prisma/client";

import type { KpiComputedValue } from "./kpi-calculation.types";

export type KpiDefinitionResult = KpiDefinition;

export type CreateKpiDefinitionInput = {
  organizationId: string;
  key: string;
  label: string;
  description?: string;
  scope: string;
  calculationMethod: Prisma.InputJsonValue;
  period: string;
  targetRelation?: string;
  createdByType: string;
  rationale: string;
};

// sourceDomainsJson is not part of the caller-facing contract above — it's
// server-derived from calculationMethod (see deriveKpiSourceDomain), never
// caller-supplied. This is what the repository actually persists.
export type CreateKpiDefinitionRepositoryInput = CreateKpiDefinitionInput & {
  sourceDomainsJson: Prisma.InputJsonValue;
};

export type ListKpiDefinitionsInput = { organizationId: string; active?: boolean };

export type KpiDefinitionWithGoalCount = KpiDefinitionResult & {
  linkedGoalCount: number;
};

export type KpiDefinitionWithGoalSnapshot = KpiDefinitionWithGoalCount & {
  currentValue: KpiComputedValue;
  currentValueLabel: string;
};
