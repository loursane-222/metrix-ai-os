import { createHash } from "node:crypto";

import { runMetrixExecutiveTurn } from "../agent/metrix-executive-agent";
import { db } from "../db";
import type { FetchLike } from "../integrations/nylas/nylas-client";
import { loadNotificationPreferences } from "../notifications/notification-preferences";

import { collectAwarenessCandidates, type AwarenessCandidate } from "./awareness-signals";

/**
 * Executive Awareness: a protected server sweep that wakes the ONE existing
 * Executive (GPT-5.6 Sol, through runMetrixExecutiveTurn) for a trusted
 * company signal — never an LLM per tick, never a second agent.
 *
 *   trusted signal → objective eligibility (awareness-signals.ts)
 *     → evaluated-once ledger → SYSTEM_EVENT Executive turn
 *     → Executive reads company truth, judges significance
 *     → notification_create only if it decides the user must know.
 *
 * Nothing here judges importance or writes notification content.
 *
 * Dedupe (no new table): the existing ActionExecution ledger holds one row
 * per (event, recipient) — actionType "awareness.evaluate". The row is
 * claimed BEFORE the Executive runs and only ever created once, so the same
 * event is evaluated once however many sweeps or duplicate cron deliveries
 * see it, and an event judged not worth a notification is never re-judged.
 * A second guard sits underneath: the Executive turn's id is derived from
 * the same identity, so even a re-run reaches notification_create with the
 * same idempotency key and reuses the existing notification.
 */
export const AWARENESS_ACTION_TYPE = "awareness.evaluate";

/** A claim whose run never finished (crash, timeout) is retried after this long. */
export const AWARENESS_STALE_CLAIM_MS = 15 * 60_000;

export const AWARENESS_MAX_EVALUATIONS_PER_SWEEP = 5;
export const AWARENESS_TIME_BUDGET_MS = 45_000;

export type AwarenessSweepSummary = {
  considered: number;
  evaluated: number;
  notified: number;
  suppressed: number;
  alreadyEvaluated: number;
  skippedMuted: number;
  failed: number;
  /** Eligible, but left for a later sweep (per-sweep evaluation/time limit). */
  deferred: number;
};

type RunTurn = typeof runMetrixExecutiveTurn;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

type Claim = { claimId: string; turnId: string };

/** Returns the claim if THIS caller now owns the evaluation, else null. */
async function claimEvaluation(
  candidate: AwarenessCandidate,
  now: Date
): Promise<Claim | null> {
  const identity = digest(`${candidate.eventKey}:${candidate.recipientUserId}`);
  const idempotencyKey = `aw:${identity}`;
  const turnId = `aw-${identity}`;

  try {
    const created = await db.actionExecution.create({
      data: {
        organizationId: candidate.organizationId,
        actionType: AWARENESS_ACTION_TYPE,
        idempotencyKey,
        requestHash: digest(candidate.eventKey),
        resourceType: "AwarenessEvent",
        resourceId: candidate.eventKey.slice(0, 200),
        status: "PENDING",
        // Claim age is measured on the sweep's own clock, the same one the
        // stale check below uses.
        createdAt: now
      }
    });

    return { claimId: created.id, turnId };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }

  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: candidate.organizationId,
        actionType: AWARENESS_ACTION_TYPE,
        idempotencyKey
      }
    }
  });

  // Evaluated already, or another sweep is evaluating it right now.
  if (!existing || existing.status !== "PENDING") return null;

  // Only a claim that has been PENDING past the stale window is retaken, and
  // only by the one caller whose conditional update matches.
  const retaken = await db.actionExecution.updateMany({
    where: {
      id: existing.id,
      status: "PENDING",
      createdAt: { lt: new Date(now.getTime() - AWARENESS_STALE_CLAIM_MS) }
    },
    data: { createdAt: now }
  });

  return retaken.count === 1 ? { claimId: existing.id, turnId } : null;
}

function wasNotified(capabilityResults: Array<{ capability: string; verification?: { verified: boolean } }>): boolean {
  return capabilityResults.some(
    result => result.capability === "notification_create" && result.verification?.verified === true
  );
}

export async function runAwarenessSweep(
  options: {
    now?: Date;
    runTurn?: RunTurn;
    fetchImpl?: FetchLike;
    maxEvaluations?: number;
    timeBudgetMs?: number;
  } = {}
): Promise<AwarenessSweepSummary> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const runTurn = options.runTurn ?? runMetrixExecutiveTurn;
  const maxEvaluations = options.maxEvaluations ?? AWARENESS_MAX_EVALUATIONS_PER_SWEEP;
  const timeBudgetMs = options.timeBudgetMs ?? AWARENESS_TIME_BUDGET_MS;

  const summary: AwarenessSweepSummary = {
    considered: 0,
    evaluated: 0,
    notified: 0,
    suppressed: 0,
    alreadyEvaluated: 0,
    skippedMuted: 0,
    failed: 0,
    deferred: 0
  };

  const candidates = await collectAwarenessCandidates(now, { fetchImpl: options.fetchImpl });
  summary.considered = candidates.length;

  const users = new Map<string, { timezone: string; muted: boolean } | null>();

  async function recipient(userId: string) {
    if (!users.has(userId)) {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { timezone: true }
      });

      users.set(
        userId,
        user
          ? {
              timezone: user.timezone,
              // Objective and cheap: a user who muted everything is never
              // proactively shown anything, so there is nothing to evaluate.
              muted: (await loadNotificationPreferences(userId)).muteAll
            }
          : null
      );
    }

    return users.get(userId) ?? null;
  }

  for (const candidate of candidates) {
    if (summary.evaluated + summary.failed >= maxEvaluations || Date.now() - startedAt > timeBudgetMs) {
      // Whatever is left is still eligible next sweep (its claim was never taken).
      summary.deferred += 1;
      continue;
    }

    const person = await recipient(candidate.recipientUserId);

    if (!person) {
      summary.failed += 1;
      continue;
    }

    if (person.muted) {
      summary.skippedMuted += 1;
      continue;
    }

    const claim = await claimEvaluation(candidate, now);

    if (!claim) {
      summary.alreadyEvaluated += 1;
      continue;
    }

    try {
      const result = await runTurn({
        origin: "SYSTEM_EVENT",
        actorUserId: candidate.recipientUserId,
        organizationId: candidate.organizationId,
        turnId: claim.turnId,
        timezone: person.timezone,
        referenceTimeIso: now.toISOString(),
        message: candidate.describe({ timezone: person.timezone, now })
      });

      await db.actionExecution.updateMany({
        where: { id: claim.claimId, status: "PENDING" },
        data: { status: "VERIFIED", verifiedAt: new Date() }
      });

      summary.evaluated += 1;

      if (wasNotified(result.capabilityResults)) summary.notified += 1;
      else summary.suppressed += 1;
    } catch {
      // The claim stays PENDING: not evaluated, not lost. It is retried
      // only after AWARENESS_STALE_CLAIM_MS, so a failing Executive call is
      // never hammered on every sweep.
      summary.failed += 1;
    }
  }

  return summary;
}
