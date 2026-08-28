import { findPaymentById } from "@/lib/core/payments/payment.service";
import {
  createCollectionAction,
  findOpenActionByPaymentAndType,
  updateCollectionActionLifecycle,
} from "@/lib/core/collection-actions/collection-action.repository";
import type { CollectionActionType } from "@/lib/core/collection-actions/collection-action.types";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionHandler } from "../../execution";

const VALID_ACTION_TYPES: readonly CollectionActionType[] = [
  "CALL", "MEETING", "LEGAL_NOTICE", "REMINDER", "NEGOTIATION", "FOLLOW_UP",
];
const DEFAULT_ACTION_TYPE: CollectionActionType = "FOLLOW_UP";

// collection.start had a manifest entry but no handler — nothing could ever
// invoke it (METRIX_SESSION_HANDOFF-tracked gap). Reuses an existing OPEN/
// IN_PROGRESS action of the same type for this payment when one already
// exists (the AI-suggestion sync creates those), otherwise creates a new
// USER_CREATED one — either way landing it in IN_PROGRESS.
export const collectionStartHandler: ActionHandler = async (envelope) => {
  const paymentId = envelope.input.paymentId;
  if (typeof paymentId !== "string" || !paymentId.trim()) throw new Error("paymentId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const customerId = typeof envelope.input.customerId === "string" ? envelope.input.customerId : undefined;
  const actionType: CollectionActionType = VALID_ACTION_TYPES.includes(envelope.input.actionType as CollectionActionType)
    ? (envelope.input.actionType as CollectionActionType)
    : DEFAULT_ACTION_TYPE;

  const payment = await findPaymentById(paymentId, organizationId);
  if (!payment) throw new Error("Payment not found.");

  const existing = await findOpenActionByPaymentAndType(organizationId, paymentId, actionType);
  if (existing) {
    await updateCollectionActionLifecycle({ id: existing.id, organizationId, status: "IN_PROGRESS" });
    return {
      status: "SUCCESS",
      entityRef: { entityType: "collection_action", entityId: existing.id },
      resultOutcome: "NO_CHANGE",
      resultSummary: "collection.start reused an existing open collection action.",
      metadata: { collectionActionId: existing.id },
      domainEvents: [],
      sideEffects: [],
    };
  }

  const created = await createCollectionAction({
    organizationId,
    paymentId,
    customerId,
    title: `${payment.title} için tahsilat takibi`,
    actionType,
    source: "USER_CREATED",
  });
  await updateCollectionActionLifecycle({ id: created.id, organizationId, status: "IN_PROGRESS" });

  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "collection_action.started", title: "Tahsilat takibi başlatıldı", body: created.title, entityType: "CollectionAction", entityId: created.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "collection_action", entityId: created.id },
    resultSummary: "collection.start completed.",
    metadata: { collectionActionId: created.id },
    domainEvents: [],
    sideEffects: [],
  };
};
