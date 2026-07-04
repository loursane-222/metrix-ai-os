import type { SalesGoal, SalesGoalPeriod, SalesGoalStatus } from "@prisma/client";

export type SalesGoalResult = SalesGoal;

export type CreateSalesGoalInput = {
  organizationId: string;
  title: string;
  period: SalesGoalPeriod;
  targetRevenueCents?: bigint;
  targetCollectionCents?: bigint;
  startsAt?: Date;
  endsAt?: Date;
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
