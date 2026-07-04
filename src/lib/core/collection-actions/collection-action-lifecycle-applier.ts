import { updateCollectionActionLifecycle } from "./collection-action.repository";
import { SIGNAL_CONFIDENCE_THRESHOLDS } from "./collection-action-lifecycle-detector";
import {
  logStatusChanged,
  logContactLogged,
  logPaymentPromised,
  logPaymentDateSet,
  logPaymentConfirmed,
} from "./collection-action-event.service";
import type {
  CollectionActionLifecycleSignal,
  LifecycleApplyResult,
} from "./collection-action-lifecycle.types";

export async function applyCollectionActionLifecycle(input: {
  organizationId: string;
  conversationId?: string | null;
  signals: CollectionActionLifecycleSignal[];
}): Promise<LifecycleApplyResult> {
  let updated = 0;
  let skipped = 0;

  for (const signal of input.signals) {
    const threshold = SIGNAL_CONFIDENCE_THRESHOLDS[signal.signalType];

    if (signal.confidence < threshold) {
      skipped++;
      continue;
    }

    if (!hasAnyUpdate(signal)) {
      skipped++;
      continue;
    }

    await updateCollectionActionLifecycle({
      id: signal.actionId,
      organizationId: input.organizationId,
      ...(signal.proposedStatus !== null ? { status: signal.proposedStatus } : {}),
      ...(signal.proposedNote !== null ? { notes: signal.proposedNote } : {}),
      ...(signal.proposedExpectedDate !== null ? { expectedPaymentDate: signal.proposedExpectedDate } : {}),
      ...(signal.proposedLastContactAt !== null ? { lastContactAt: signal.proposedLastContactAt } : {}),
    });

    await emitLifecycleEvent({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      signal,
    });

    updated++;
  }

  return { updated, skipped };
}

async function emitLifecycleEvent(input: {
  organizationId: string;
  conversationId?: string | null;
  signal: CollectionActionLifecycleSignal;
}): Promise<void> {
  const { organizationId, conversationId, signal } = input;
  const base = { organizationId, collectionActionId: signal.actionId, conversationId };

  switch (signal.signalType) {
    case "STARTED_CONTACT":
      await logContactLogged(base);
      if (signal.proposedStatus) {
        await logStatusChanged({
          ...base,
          fromStatus: signal.currentStatus,
          toStatus: signal.proposedStatus,
        });
      }
      break;

    case "PROMISED_PAYMENT":
      await logPaymentPromised(base);
      break;

    case "PAYMENT_DATE_SET":
      if (signal.proposedExpectedDate) {
        await logPaymentDateSet({ ...base, expectedDate: signal.proposedExpectedDate });
      }
      break;

    case "PAYMENT_CONFIRMED":
      await logPaymentConfirmed(base);
      if (signal.proposedStatus) {
        await logStatusChanged({
          ...base,
          fromStatus: signal.currentStatus,
          toStatus: signal.proposedStatus,
        });
      }
      break;

    case "DISMISSED":
      if (signal.proposedStatus) {
        await logStatusChanged({
          ...base,
          fromStatus: signal.currentStatus,
          toStatus: signal.proposedStatus,
        });
      }
      break;
  }
}

function hasAnyUpdate(signal: CollectionActionLifecycleSignal): boolean {
  return (
    signal.proposedStatus !== null ||
    signal.proposedNote !== null ||
    signal.proposedExpectedDate !== null ||
    signal.proposedLastContactAt !== null
  );
}
