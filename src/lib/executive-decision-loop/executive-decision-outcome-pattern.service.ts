import { prisma } from "@/lib/core/shared/prisma";

export type ExecutiveDecisionOutcomePatternData = {
  repeatedFailureCount: number;
  reAgendaCount: number;
};

// repeatedFailureCount: aynı decisionRecordId için FAILURE sayısı >= 2 olan karar sayısı.
// reAgendaCount: pencere içinde FAILURE veya ABANDONED outcome almış distinct karar sayısı.
// Varsayım: follow-up engine'deki shouldReagenda mantığıyla örtüşüyor
// (shouldReagenda === true when outcome === "FAILURE" || "ABANDONED").
export async function buildOutcomePatternData(
  organizationId: string,
  windowStart: Date,
): Promise<ExecutiveDecisionOutcomePatternData> {
  try {
    const outcomes = await prisma.executiveDecisionOutcome.findMany({
      where: { organizationId, occurredAt: { gte: windowStart } },
      select: { decisionRecordId: true, outcome: true },
    });

    const failuresByDecision = new Map<string, number>();
    const reagendaDecisions = new Set<string>();

    for (const o of outcomes) {
      if (o.outcome === "FAILURE") {
        failuresByDecision.set(
          o.decisionRecordId,
          (failuresByDecision.get(o.decisionRecordId) ?? 0) + 1,
        );
      }
      if (o.outcome === "FAILURE" || o.outcome === "ABANDONED") {
        reagendaDecisions.add(o.decisionRecordId);
      }
    }

    const repeatedFailureCount = [...failuresByDecision.values()].filter(
      (count) => count >= 2,
    ).length;

    return {
      repeatedFailureCount,
      reAgendaCount: reagendaDecisions.size,
    };
  } catch {
    return { repeatedFailureCount: 0, reAgendaCount: 0 };
  }
}
