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
  const candidateSummary = {
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

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
