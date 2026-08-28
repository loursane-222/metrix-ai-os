import { findPaymentById, voidPayment } from "@/lib/core/payments/payment.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionHandler } from "../../execution";

export const paymentVoidHandler: ActionHandler = async (envelope) => {
  const paymentId = envelope.input.paymentId;
  if (typeof paymentId !== "string" || !paymentId.trim()) throw new Error("paymentId is required.");
  const organizationId = envelope.executionContext.organizationId;
  const existing = await findPaymentById(paymentId, organizationId);
  if (!existing) throw new Error("Payment not found.");
  if (existing.status === "CANCELLED") {
    return { status: "SUCCESS", entityRef: { entityType: "payment", entityId: paymentId }, resultOutcome: "NO_CHANGE", metadata: { paymentId }, domainEvents: [], sideEffects: [] };
  }
  await voidPayment({ paymentId, organizationId });
  await notifyWithOwnerFanout({ organizationId, actorUserId: envelope.executionContext.actorId, type: "payment.voided", title: "Tahsilat kaydı iptal edildi", body: existing.title, entityType: "Payment", entityId: paymentId });
  return {
    status: "SUCCESS", entityRef: { entityType: "payment", entityId: paymentId },
    resultSummary: "payment.void completed.", metadata: { paymentId },
    domainEvents: [], sideEffects: [],
  };
};
