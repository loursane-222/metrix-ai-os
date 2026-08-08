import { updateQuoteLifecycle } from "./quote.repository";
import { SIGNAL_CONFIDENCE_THRESHOLDS } from "./quote-workflow-lifecycle-detector";
import {
  logQuoteSent,
  logQuoteViewed,
  logQuoteNegotiationStarted,
  logQuoteWon,
  logQuoteLost,
  logQuoteCancelled,
  logQuoteFollowedUp,
  logQuoteRevisionRequested,
  logQuoteStatusChanged,
} from "./quote-event.service";
import type {
  QuoteWorkflowSignal,
  QuoteWorkflowApplyResult,
  QuoteWorkflowSignalType,
} from "./quote-workflow-lifecycle.types";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";

export async function applyQuoteWorkflowLifecycle(input: {
  organizationId: string;
  conversationId?: string | null;
  actorUserId?: string;
  additionalNotificationTargets?: string[];
  signals: QuoteWorkflowSignal[];
}): Promise<QuoteWorkflowApplyResult> {
  let updated = 0;
  let skipped = 0;
  const notificationClarifications: QuoteWorkflowApplyResult["notificationClarifications"] = [];

  for (const signal of input.signals) {
    const threshold = SIGNAL_CONFIDENCE_THRESHOLDS[signal.signalType];

    if (signal.confidence < threshold) {
      skipped++;
      continue;
    }

    if (signal.isEventOnly) {
      await emitEventOnlySignal({
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        signal,
      });
      updated++;
      continue;
    }

    if (!hasAnyUpdate(signal)) {
      skipped++;
      continue;
    }

    await updateQuoteLifecycle({
      id: signal.quoteId,
      organizationId: input.organizationId,
      ...(signal.proposedStatus !== null ? { status: signal.proposedStatus } : {}),
      ...(signal.proposedNote !== null ? { notes: signal.proposedNote } : {}),
      ...(signal.proposedSentAt !== null ? { sentAt: signal.proposedSentAt } : {}),
      ...(signal.proposedViewedAt !== null ? { viewedAt: signal.proposedViewedAt } : {}),
      ...(signal.proposedWonAt !== null ? { wonAt: signal.proposedWonAt } : {}),
      ...(signal.proposedLostAt !== null ? { lostAt: signal.proposedLostAt } : {}),
    });

    await emitLifecycleEvent({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      signal,
    });
    if (signal.signalType === "QUOTE_WON") {
      const fanout = await notifyWithOwnerFanout({ organizationId: input.organizationId, actorUserId: input.actorUserId, additionalTargets: input.additionalNotificationTargets, type: "quote.won", title: "Teklif kazanıldı", entityType: "Quote", entityId: signal.quoteId });
      const unresolved = fanout.additionalTargetResolutions.filter((item) => item.resolution.status !== "RESOLVED");
      if (unresolved.length) notificationClarifications.push({
        targets: unresolved.map((item) => item.target),
        candidateNames: unresolved.flatMap((item) => item.resolution.status === "AMBIGUOUS" ? item.resolution.candidates.map((candidate) => candidate.fullName).filter((name): name is string => Boolean(name)) : []),
      });
    }

    updated++;
  }

  return { updated, skipped, notificationClarifications };
}

async function emitEventOnlySignal(input: {
  organizationId: string;
  conversationId?: string | null;
  signal: QuoteWorkflowSignal;
}): Promise<void> {
  const { organizationId, conversationId, signal } = input;
  const base = { organizationId, quoteId: signal.quoteId, conversationId };

  switch (signal.signalType) {
    case "QUOTE_FOLLOWED_UP":
      await logQuoteFollowedUp(base);
      break;
    case "QUOTE_REVISION_REQUESTED":
      await logQuoteRevisionRequested(base);
      break;
  }
}

async function emitLifecycleEvent(input: {
  organizationId: string;
  conversationId?: string | null;
  signal: QuoteWorkflowSignal;
}): Promise<void> {
  const { organizationId, conversationId, signal } = input;
  const base = { organizationId, quoteId: signal.quoteId, conversationId };

  switch (signal.signalType) {
    case "QUOTE_SENT":
      await logQuoteSent(base);
      if (signal.proposedStatus) {
        await logQuoteStatusChanged({ ...base, fromStatus: signal.currentStatus, toStatus: signal.proposedStatus });
      }
      break;

    case "QUOTE_VIEWED":
      await logQuoteViewed(base);
      if (signal.proposedStatus) {
        await logQuoteStatusChanged({ ...base, fromStatus: signal.currentStatus, toStatus: signal.proposedStatus });
      }
      break;

    case "QUOTE_NEGOTIATING":
      await logQuoteNegotiationStarted(base);
      if (signal.proposedStatus) {
        await logQuoteStatusChanged({ ...base, fromStatus: signal.currentStatus, toStatus: signal.proposedStatus });
      }
      break;

    case "QUOTE_WON":
      await logQuoteWon(base);
      if (signal.proposedStatus) {
        await logQuoteStatusChanged({ ...base, fromStatus: signal.currentStatus, toStatus: signal.proposedStatus });
      }
      break;

    case "QUOTE_LOST":
      await logQuoteLost(base);
      if (signal.proposedStatus) {
        await logQuoteStatusChanged({ ...base, fromStatus: signal.currentStatus, toStatus: signal.proposedStatus });
      }
      break;

    case "QUOTE_CANCELLED":
      await logQuoteCancelled(base);
      if (signal.proposedStatus) {
        await logQuoteStatusChanged({ ...base, fromStatus: signal.currentStatus, toStatus: signal.proposedStatus });
      }
      break;
  }
}

function hasAnyUpdate(signal: QuoteWorkflowSignal): boolean {
  return (
    signal.proposedStatus !== null ||
    signal.proposedNote !== null ||
    signal.proposedSentAt !== null ||
    signal.proposedViewedAt !== null ||
    signal.proposedWonAt !== null ||
    signal.proposedLostAt !== null
  );
}

// Exported for type narrowing in emitEventOnlySignal
type EventOnlySignalType = Extract<QuoteWorkflowSignalType, "QUOTE_FOLLOWED_UP" | "QUOTE_REVISION_REQUESTED">;
export type { EventOnlySignalType };
