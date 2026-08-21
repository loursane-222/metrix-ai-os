import type { KpiDefinition, Prisma } from "@prisma/client";

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

export type KpiDefinitionWithGoalSnapshot = KpiDefinitionResult & {
  linkedGoalCount: number;
};
