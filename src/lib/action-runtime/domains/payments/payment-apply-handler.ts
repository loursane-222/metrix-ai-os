import { applyPaymentAmount } from "@/lib/core/payments/payment.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { createApprovedMemoryItem } from "@/lib/core/memory-items/memory-item.service";
import { auditStore } from "../../audit";
import type { ActionHandler } from "../../execution";

/**
 * Reference implementation handler for payment.apply, following the same
 * critical/non-critical side-effect split as invoiceCreateHandler:
 * applyPaymentAmount() (the canonical Prisma write) is the sole CRITICAL
 * side effect. Notification and Executive Memory are NON-CRITICAL: they run
 * after the Payment row is already committed, are individually try/caught,
 * and a failure in either is recorded as its own audit entry plus surfaced
 * in the returned metadata (notificationDelivered/memoryRecorded) rather
 * than failing or hiding the overall action.
 */
export const paymentApplyHandler: ActionHandler = async (envelope) => {
  const paymentId = envelope.input.paymentId;
  if (typeof paymentId !== "string" || !paymentId.trim()) throw new Error("paymentId is required.");
  if (envelope.entityRef?.entityType !== "payment" || envelope.entityRef.entityId !== paymentId) {
    throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  }
  const amount = envelope.input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new Error("amount must be a positive number.");

  // CRITICAL side effect — its failure is the handler's failure.
  const outcome = await applyPaymentAmount({
    organizationId: envelope.executionContext.organizationId,
    paymentId,
    amount,
  });

  if (!outcome) {
    return { status: "FAILURE", errorMessage: "Payment was not found in this organization." };
  }

  const { payment } = outcome;
  const entityRef = { entityType: "payment", entityId: paymentId };

  // NON-CRITICAL side effect #1 — recorded, never allowed to fail the action.
  let notificationDelivered = true;
  try {
    await notifyWithOwnerFanout({
      organizationId: envelope.executionContext.organizationId,
      actorUserId: envelope.executionContext.actorId,
      recipientUserId: envelope.executionContext.actorId,
      type: "payment.applied",
      title: payment.status === "PAID" ? "Tahsilat tamamlandı" : "Kısmi tahsilat kaydedildi",
      body: `${payment.title} — ${amount} ${payment.currency}`,
      severity: "INFO",
      entityType: "Payment",
      entityId: paymentId,
    });
  } catch (cause) {
    notificationDelivered = false;
    auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "payment.apply.notify",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "NOTIFICATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Notification delivery failed.",
      metadata: { paymentId, critical: false },
    });
  }

  // NON-CRITICAL side effect #2 — recorded, never allowed to fail the action.
  let memoryRecorded = true;
  try {
    await createApprovedMemoryItem({
      organizationId: envelope.executionContext.organizationId,
      createdByUserId: envelope.executionContext.actorId,
      subjectType: "ORGANIZATION",
      type: "FACT",
      key: `payment.applied.${paymentId}.${Date.now()}`,
      value: `Tahsilat işlendi: "${payment.title}", ${amount} ${payment.currency} — yeni durum ${payment.status}.`,
      source: "EVENT_DERIVED",
      confidence: 0.9,
      isUserConfirmed: false,
      metadata: { paymentId, amount, status: payment.status },
    });
  } catch (cause) {
    memoryRecorded = false;
    auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "payment.apply.memory",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "MEMORY_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Executive Memory write failed.",
      metadata: { paymentId, critical: false },
    });
  }

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: "payment.apply completed.",
    metadata: {
      paymentId,
      status: payment.status,
      paidAmount: payment.paidAmount.toString(),
      notificationDelivered,
      memoryRecorded,
    },
    domainEvents: [],
    sideEffects: [],
  };
};
