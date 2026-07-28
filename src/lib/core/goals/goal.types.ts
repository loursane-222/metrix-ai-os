import type { Prisma, SalesGoal, SalesGoalPeriod, SalesGoalStatus } from "@prisma/client";

export type SalesGoalResult = SalesGoal;

export type CreateSalesGoalInput = {
  organizationId: string;
  title: string;
  period: SalesGoalPeriod;
  targetRevenueCents?: bigint;
  targetCollectionCents?: bigint;
  startsAt?: Date;
  endsAt?: Date;
  scope?: string;
  scopeRefId?: string;
  goalType?: string;
  currency?: string;
  targetValue?: number;
  actualValue?: number;
  forecastValue?: number;
  ownerUserId?: string;
  kpiDefinitionId?: string;
  provenanceJson?: Prisma.InputJsonValue;
};

export type UpdateSalesGoalInput = {
  id: string;
  organizationId: string;
  title?: string;
  period?: SalesGoalPeriod;
  targetRevenueCents?: bigint;
  targetCollectionCents?: bigint;
  startsAt?: Date;
  endsAt?: Date;
  status?: SalesGoalStatus;
};

export type ListSalesGoalsInput = {
  organizationId: string;
  period?: SalesGoalPeriod;
  status?: SalesGoalStatus;
  limit?: number;
};
