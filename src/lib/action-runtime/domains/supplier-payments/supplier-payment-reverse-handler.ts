import { reverseSupplierPayment } from "@/lib/core/supplier-payments/supplier-payment.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { auditStore } from "../../audit";
import type { ActionHandler } from "../../execution";

/**
 * supplierPayment.reverse — settlement-reverse-handler.ts /
 * expense-settlement-reverse-handler.ts ile aynı desen.
 */
export const supplierPaymentReverseHandler: ActionHandler = async (envelope) => {
  const supplierPaymentId = envelope.input.supplierPaymentId;
  if (typeof supplierPaymentId !== "string" || !supplierPaymentId.trim()) throw new Error("supplierPaymentId is required.");
  if (envelope.entityRef?.entityType !== "supplier_payment" || envelope.entityRef.entityId !== supplierPaymentId) {
    throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  }
  const reason = envelope.input.reason;
  if (typeof reason !== "string" || !reason.trim()) throw new Error("reason is required.");

  const outcome = await reverseSupplierPayment({
    organizationId: envelope.executionContext.organizationId,
    supplierPaymentId,
    reason,
    actorId: envelope.executionContext.actorId,
  });

  if (!outcome) {
    return { status: "FAILURE", errorMessage: "Supplier payment was not found in this organization." };
  }

  const entityRef = { entityType: "supplier_payment", entityId: supplierPaymentId };

  let notificationDelivered = true;
  try {
    await notifyWithOwnerFanout({
      organizationId: envelope.executionContext.organizationId,
      actorUserId: envelope.executionContext.actorId,
      recipientUserId: envelope.executionContext.actorId,
      type: "supplierPayment.reversed",
      title: "Tedarikçi ödemesi geri alındı",
      body: `${outcome.settlement.amount} ${outcome.settlement.currency} — ${reason}`,
      severity: "INFO",
      entityType: "PurchaseInvoice",
      entityId: outcome.purchaseInvoice.id,
    });
  } catch (cause) {
    notificationDelivered = false;
    await auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "supplierPayment.reverse.notify",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "NOTIFICATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Notification delivery failed.",
      metadata: { supplierPaymentId, critical: false },
    });
  }

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: "supplierPayment.reverse completed.",
    metadata: {
      supplierPaymentId,
      reversalSupplierPaymentId: outcome.settlement.id,
      movementId: outcome.movement.id,
      purchaseInvoiceId: outcome.purchaseInvoice.id,
      purchaseInvoiceStatus: outcome.purchaseInvoice.status,
      paidAmount: outcome.purchaseInvoice.paidAmount.toString(),
      notificationDelivered,
    },
    domainEvents: [],
    sideEffects: [],
  };
};
