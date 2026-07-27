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
): void {
  void persistExecutiveRuntimeTrace(trace).catch((error: unknown) => {
    console.warn("executive_runtime_trace_persistence_failed", {
      requestId: trace.requestId,
      organizationId: trace.organizationId,
      errorCode: error instanceof Error ? error.name : "UNKNOWN",
    });
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
