// Stage 2 lifecycle persistence (Grand Consolidation §5.5-5.6). This module
// owns no judgment — it only records what the Executive Agent already
// decided, and derives anti-noise behavior (dedup / escalation /
// resolution) from that record so a restart never re-fires a standing,
// already-delivered issue.

import { prisma } from "@/lib/core/shared/prisma";
import type { AwarenessJudgment } from "./executive-autonomous-watch.types";

const SIGNIFICANCE_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export type ApplyJudgmentOutcome = Readonly<{
  insightId: string;
  isNew: boolean;
  isEscalation: boolean;
  /** True only when this application should actually deliver a notification. */
  shouldDeliver: boolean;
}>;

/**
 * Fingerprint for the persisted lifecycle row: derived from the judgment's
 * own evidence fingerprint set, not from the Agent's correlationTitle text,
 * so the same underlying issue lands on the same row run after run even if
 * the Agent phrases the title slightly differently each time.
 */
export function deriveInsightFingerprint(evidenceFingerprints: readonly string[]): string {
  return [...evidenceFingerprints].sort().join("|");
}

export async function applyJudgment(
  organizationId: string,
  judgment: AwarenessJudgment,
): Promise<ApplyJudgmentOutcome> {
  const fingerprint = deriveInsightFingerprint(judgment.evidenceFingerprints);
  const now = new Date();

  const existing = await prisma.executiveAwarenessInsight.findUnique({
    where: { organizationId_fingerprint: { organizationId, fingerprint } },
  });

  if (!existing) {
    const deliverable = judgment.disposition === "INTERVENE" && judgment.deliveryEligible;
    const created = await prisma.executiveAwarenessInsight.create({
      data: {
        organizationId,
        fingerprint,
        correlationTitle: judgment.correlationTitle,
        disposition: judgment.disposition,
        significance: judgment.significance,
        confidence: judgment.confidence,
        category: judgment.category,
        urgency: judgment.urgency,
        reason: judgment.reason,
        insightText: judgment.insight,
        recommendedNextMove: judgment.recommendedNextMove,
        evidenceFingerprints: [...judgment.evidenceFingerprints],
        status: "OPEN",
        firstSeenAt: now,
        lastSeenAt: now,
        lastDeliveredAt: deliverable ? now : null,
        lastDeliveredSignificance: deliverable ? judgment.significance : null,
      },
    });
    return { insightId: created.id, isNew: true, isEscalation: false, shouldDeliver: deliverable };
  }

  const wasResolved = existing.status === "RESOLVED";
  const priorSignificanceRank = existing.lastDeliveredSignificance
    ? (SIGNIFICANCE_RANK[existing.lastDeliveredSignificance] ?? -1)
    : -1;
  const currentSignificanceRank = SIGNIFICANCE_RANK[judgment.significance] ?? 0;
  const isEscalation = existing.lastDeliveredAt !== null && currentSignificanceRank > priorSignificanceRank;

  // Deliver only for: a genuinely new open issue reopening after resolution,
  // an escalation past the last-delivered significance, or an issue that was
  // judged INTERVENE-eligible but has never actually been delivered yet
  // (e.g. it was previously muted/ineligible and is now eligible).
  const neverDelivered = existing.lastDeliveredAt === null;
  const deliverable =
    judgment.disposition === "INTERVENE" &&
    judgment.deliveryEligible &&
    (wasResolved || isEscalation || neverDelivered);

  const updated = await prisma.executiveAwarenessInsight.update({
    where: { organizationId_fingerprint: { organizationId, fingerprint } },
    data: {
      correlationTitle: judgment.correlationTitle,
      disposition: judgment.disposition,
      significance: judgment.significance,
      confidence: judgment.confidence,
      category: judgment.category,
      urgency: judgment.urgency,
      reason: judgment.reason,
      insightText: judgment.insight,
      recommendedNextMove: judgment.recommendedNextMove,
      evidenceFingerprints: [...judgment.evidenceFingerprints],
      status: "OPEN",
      lastSeenAt: now,
      resolvedAt: null,
      ...(deliverable ? { lastDeliveredAt: now, lastDeliveredSignificance: judgment.significance } : {}),
    },
  });

  return { insightId: updated.id, isNew: false, isEscalation, shouldDeliver: deliverable };
}

/**
 * Resolution sweep: any OPEN insight not re-observed in the current run
 * (its evidence no longer appeared) is closed. Called once per organization
 * per cycle, after all of this run's judgments have been applied.
 */
export async function resolveUnseenInsights(organizationId: string, seenInsightIds: readonly string[]): Promise<number> {
  const result = await prisma.executiveAwarenessInsight.updateMany({
    where: {
      organizationId,
      status: "OPEN",
      id: { notIn: [...seenInsightIds] },
    },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  return result.count;
}

export async function listOpenInsights(organizationId: string) {
  return prisma.executiveAwarenessInsight.findMany({
    where: { organizationId, status: "OPEN" },
    orderBy: { lastSeenAt: "desc" },
  });
}
