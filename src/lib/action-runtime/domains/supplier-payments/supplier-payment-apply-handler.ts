import { PaymentMethod } from "@prisma/client";
import { applySupplierPayment } from "@/lib/core/supplier-payments/supplier-payment.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { auditStore } from "../../audit";
import type { ActionHandler } from "../../execution";

function requiredPaymentMethod(value: unknown): PaymentMethod {
  if (typeof value !== "string" || !Object.values(PaymentMethod).includes(value as PaymentMethod)) {
    throw new Error("paymentMethod must be one of " + Object.values(PaymentMethod).join(", ") + ".");
  }
  return value as PaymentMethod;
}

/**
 * supplierPayment.apply — payment-apply-handler.ts / expense-settle-handler.ts
 * ile aynı critical/non-critical yan etki ayrımı: applySupplierPayment()
 * (canonical SupplierPayment+FinancialAccountMovement yazımı, Settlement/
 * Application authority'sini bypass etmez) tek CRITICAL yan etkidir.
 */
export const supplierPaymentApplyHandler: ActionHandler = async (envelope) => {
  const purchaseInvoiceId = envelope.input.purchaseInvoiceId;
  if (typeof purchaseInvoiceId !== "string" || !purchaseInvoiceId.trim()) throw new Error("purchaseInvoiceId is required.");
  if (envelope.entityRef?.entityType !== "purchase_invoice" || envelope.entityRef.entityId !== purchaseInvoiceId) {
    throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  }
  const amount = envelope.input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new Error("amount must be a positive number.");
  const paymentMethod = requiredPaymentMethod(envelope.input.paymentMethod);
  const financialAccountReference = envelope.input.financialAccountReference;
  if (typeof financialAccountReference !== "string" || !financialAccountReference.trim()) throw new Error("financialAccountReference is required.");
  const occurredAtInput = envelope.input.occurredAt;
  if (occurredAtInput !== undefined && typeof occurredAtInput !== "string") throw new Error("occurredAt must be a string.");
  const idempotencyKeyInput = envelope.input.idempotencyKey;
  if (idempotencyKeyInput !== undefined && typeof idempotencyKeyInput !== "string") throw new Error("idempotencyKey must be a string.");

  const outcome = await applySupplierPayment({
    organizationId: envelope.executionContext.organizationId,
    purchaseInvoiceId,
    amount,
    paymentMethod,
    financialAccountReference,
    occurredAt: occurredAtInput ? new Date(occurredAtInput) : undefined,
    idempotencyKey: idempotencyKeyInput,
    actorId: envelope.executionContext.actorId,
  });

  if (!outcome) {
    return { status: "FAILURE", errorMessage: "PurchaseInvoice was not found in this organization." };
  }

  const { purchaseInvoice } = outcome;
  const entityRef = { entityType: "purchase_invoice", entityId: purchaseInvoiceId };

  let notificationDelivered = true;
  try {
    await notifyWithOwnerFanout({
      organizationId: envelope.executionContext.organizationId,
      actorUserId: envelope.executionContext.actorId,
      recipientUserId: envelope.executionContext.actorId,
      type: "supplierPayment.applied",
      title: purchaseInvoice.status === "PAID" ? "Tedarikçi ödemesi tamamlandı" : "Kısmi tedarikçi ödemesi kaydedildi",
      body: `${purchaseInvoice.supplierInvoiceNumber} — ${amount} ${purchaseInvoice.currency}`,
      severity: "INFO",
      entityType: "PurchaseInvoice",
      entityId: purchaseInvoiceId,
    });
  } catch (cause) {
    notificationDelivered = false;
    await auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "supplierPayment.apply.notify",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "NOTIFICATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Notification delivery failed.",
      metadata: { purchaseInvoiceId, critical: false },
    });
  }

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: "supplierPayment.apply completed.",
    metadata: {
      purchaseInvoiceId,
      status: purchaseInvoice.status,
      paidAmount: purchaseInvoice.paidAmount.toString(),
      settlementId: outcome.settlement.id,
      movementId: outcome.movement.id,
      replayed: outcome.replayed,
      notificationDelivered,
    },
    domainEvents: [],
    sideEffects: [],
  };
};
