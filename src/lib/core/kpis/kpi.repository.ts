import { prisma } from "@/lib/core/shared/prisma";

import type { CreateKpiDefinitionRepositoryInput, KpiDefinitionResult, KpiDefinitionWithGoalCount, ListKpiDefinitionsInput } from "./kpi.types";

export async function createKpiDefinition(input: CreateKpiDefinitionRepositoryInput): Promise<KpiDefinitionResult> {
  return prisma.kpiDefinition.create({
    data: {
      organizationId: input.organizationId,
      key: input.key,
      label: input.label,
      description: input.description,
      scope: input.scope,
      calculationMethod: input.calculationMethod,
      sourceDomainsJson: input.sourceDomainsJson,
      period: input.period,
      targetRelation: input.targetRelation,
      createdByType: input.createdByType,
      rationale: input.rationale,
    },
  });
}

export async function listKpiDefinitionsForOrganization(input: ListKpiDefinitionsInput): Promise<KpiDefinitionWithGoalCount[]> {
  const rows = await prisma.kpiDefinition.findMany({
    where: { organizationId: input.organizationId, active: input.active },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { goals: true } } },
  });
  return rows.map(({ _count, ...row }) => ({ ...row, linkedGoalCount: _count.goals }));
}

export async function findKpiDefinitionById(id: string, organizationId: string): Promise<KpiDefinitionResult | null> {
  return prisma.kpiDefinition.findFirst({ where: { id, organizationId } });
}
