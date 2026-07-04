import { prisma } from "@/lib/core/shared/prisma";

import type { Prisma, ExecutiveSignalSnapshot } from "@prisma/client";
import type { CreateSignalSnapshotInput } from "./executive-signal-snapshot.types";

export async function findDailyAnchorForDate(
  organizationId: string,
  snapshotDate: string,
): Promise<ExecutiveSignalSnapshot | null> {
  return prisma.executiveSignalSnapshot.findFirst({
    where: {
      organizationId,
      snapshotDate,
      snapshotType: "DAILY_ANCHOR",
    },
  });
}

export async function findEscalationForDateAndKey(
  organizationId: string,
  snapshotDate: string,
  escalationKey: string,
): Promise<ExecutiveSignalSnapshot | null> {
  return prisma.executiveSignalSnapshot.findFirst({
    where: {
      organizationId,
      snapshotDate,
      snapshotType: "RISK_ESCALATION",
      escalationKey,
    },
  });
}

export async function createSignalSnapshot(
  input: CreateSignalSnapshotInput,
): Promise<ExecutiveSignalSnapshot> {
  return prisma.executiveSignalSnapshot.create({
    data: {
      organizationId: input.organizationId,
      snapshotDate: input.snapshotDate,
      snapshotType: input.snapshotType,
      overallRisk: input.overallRisk,
      snapshotPayload: input.snapshotPayload as Prisma.InputJsonObject,
      escalationFrom: input.escalationFrom ?? null,
      escalationTo: input.escalationTo ?? null,
      escalationKey: input.escalationKey ?? null,
    },
  });
}

export async function findRecentSnapshots(
  organizationId: string,
  cutoffDate: string,
): Promise<ExecutiveSignalSnapshot[]> {
  return prisma.executiveSignalSnapshot.findMany({
    where: {
      organizationId,
      snapshotDate: { gte: cutoffDate },
    },
    orderBy: [{ snapshotDate: "asc" }, { createdAt: "asc" }],
  });
}
