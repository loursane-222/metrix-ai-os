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
  sourceDomainsJson: Prisma.InputJsonValue;
  period: string;
  targetRelation?: string;
  createdByType: string;
  rationale: string;
};

export type ListKpiDefinitionsInput = { organizationId: string; active?: boolean };

export type KpiDefinitionWithGoalCount = KpiDefinitionResult & {
  linkedGoalCount: number;
};

export type KpiDefinitionWithGoalSnapshot = KpiDefinitionWithGoalCount & {
  currentValue: KpiComputedValue;
  currentValueLabel: string;
};
