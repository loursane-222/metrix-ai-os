import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/core/shared/prisma";
import type { ExecutiveRuntimeTraceV1 } from "./contracts";

export async function persistExecutiveRuntimeTrace(
  trace: ExecutiveRuntimeTraceV1,
): Promise<void> {
  await prisma.executiveRuntimeTraceRecord.upsert({
    where: {
      organizationId_requestId: {
        organizationId: trace.organizationId,
        requestId: trace.requestId,
      },
    },
    update: {
      traceJson: toJson(trace),
      persistenceStatus: "RECORDED",
    },
    create: {
      organizationId: trace.organizationId,
      requestId: trace.requestId,
      conversationId: trace.conversationId,
      channel: trace.channel,
      schemaVersion: trace.schemaVersion,
      traceJson: toJson(trace),
      redactionVersion: "identity-provenance-only.v1",
    },
  });
}

export function persistExecutiveRuntimeTraceDeferred(
  trace: ExecutiveRuntimeTraceV1,
): Promise<void> {
  return persistExecutiveRuntimeTrace(trace).catch((error: unknown) => {
    console.warn("executive_runtime_trace_persistence_failed", {
      requestId: trace.requestId,
      organizationId: trace.organizationId,
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
  });
}

export async function appendExecutiveRuntimeCandidateTrace(input: Readonly<{
  organizationId: string;
  requestId: string;
  candidates: readonly Readonly<{
    id: string;
    status: string;
    changes: readonly Readonly<{ id: string; approvalStatus: string }>[];
    promotionReceipts?: readonly Readonly<{
      executionId: string;
      status: string;
      approvedChangeIds: unknown;
    }>[];
  }>[];
  blockedAiGeneratedCount: number;
}>): Promise<void> {
  const record = await prisma.executiveRuntimeTraceRecord.findUnique({
    where: {
      organizationId_requestId: {
        organizationId: input.organizationId,
        requestId: input.requestId,
      },
    },
    select: { traceJson: true },
  });
  if (!record || !isObject(record.traceJson)) return;
  const nextSummary = {
    propositionIds: input.candidates.map((candidate) => candidate.id),
    changeIds: input.candidates.flatMap((candidate) =>
      candidate.changes.map((change) => change.id)
    ),
    approvalStates: input.candidates.map((candidate) => ({
      candidateId: candidate.id,
      status: candidate.status,
      changes: candidate.changes.map((change) => ({
        changeId: change.id,
        approvalStatus: change.approvalStatus,
      })),
    })),
    promotions: input.candidates.flatMap((candidate) =>
      (candidate.promotionReceipts ?? []).map((receipt) => ({
        candidateId: candidate.id,
        executionId: receipt.executionId,
        status: receipt.status,
        approvedChangeIds: receipt.approvedChangeIds,
      }))
    ),
    blockedAiGeneratedCount: input.blockedAiGeneratedCount,
  };
  const candidateSummary = mergeCandidateSummary(
    record.traceJson.candidateSummary,
    nextSummary,
  );
  await prisma.executiveRuntimeTraceRecord.update({
    where: {
      organizationId_requestId: {
        organizationId: input.organizationId,
        requestId: input.requestId,
      },
    },
    data: {
      traceJson: toJson({ ...record.traceJson, candidateSummary }),
    },
  });
}

export function mergeCandidateSummary(
  current: unknown,
  next: Readonly<{
    propositionIds: readonly string[];
    changeIds: readonly string[];
    approvalStates: readonly (Readonly<{ candidateId: string }> & Readonly<Record<string, unknown>>)[];
    promotions: readonly (
      Readonly<{ candidateId: string; executionId: string }>
      & Readonly<Record<string, unknown>>
    )[];
    blockedAiGeneratedCount: number;
  }>,
): Record<string, unknown> {
  const existing = isObject(current) ? current : {};
  const priorApprovalStates = objectArray(existing.approvalStates);
  const priorPromotions = objectArray(existing.promotions);
  return {
    propositionIds: uniqueStrings([
      ...stringArray(existing.propositionIds),
      ...next.propositionIds,
    ]),
    changeIds: uniqueStrings([
      ...stringArray(existing.changeIds),
      ...next.changeIds,
    ]),
    approvalStates: mergeObjectsByKey(
      priorApprovalStates,
      [...next.approvalStates],
      "candidateId",
    ),
    promotions: mergeObjectsByCompositeKey(
      priorPromotions,
      [...next.promotions],
      (value) => `${String(value.candidateId)}:${String(value.executionId)}`,
    ),
    blockedAiGeneratedCount: Math.max(
      numberValue(existing.blockedAiGeneratedCount),
      next.blockedAiGeneratedCount,
    ),
  };
}

function mergeObjectsByKey(
  current: Record<string, unknown>[],
  next: readonly Readonly<Record<string, unknown>>[],
  key: string,
): Record<string, unknown>[] {
  const values = new Map(current.map((value) => [String(value[key]), value]));
  for (const value of next) values.set(String(value[key]), { ...value });
  return [...values.values()];
}

function mergeObjectsByCompositeKey(
  current: Record<string, unknown>[],
  next: readonly Readonly<Record<string, unknown>>[],
  key: (value: Readonly<Record<string, unknown>>) => string,
): Record<string, unknown>[] {
  const values = new Map(current.map((value) => [key(value), value]));
  for (const value of next) values.set(key(value), { ...value });
  return [...values.values()];
}

function objectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
