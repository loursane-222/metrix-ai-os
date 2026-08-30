import { PaymentMethod } from "@prisma/client";
import { clearInstrument } from "@/lib/core/financial-instruments/financial-instrument.service";
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
 * financialInstrument.clear — payment-apply-handler.ts / expense-settle-handler.ts
 * / supplier-payment-apply-handler.ts ile aynı critical/non-critical yan
 * etki ayrımı: clearInstrument() (canonical instrument status transition +
 * her aktif allocation için var olan applySettlement/settleExpense/
 * applySupplierPayment authority'sini reuse) tek CRITICAL yan etkidir. Bu,
 * bir enstrümanın gerçek para hareketi ürettiği TEK sınırdır.
 */
export const financialInstrumentClearHandler: ActionHandler = async (envelope) => {
  const instrumentId = envelope.input.instrumentId;
  if (typeof instrumentId !== "string" || !instrumentId.trim()) throw new Error("instrumentId is required.");
  if (envelope.entityRef?.entityType !== "financial_instrument" || envelope.entityRef.entityId !== instrumentId) {
    throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  }
  const paymentMethod = requiredPaymentMethod(envelope.input.paymentMethod);
  const financialAccountReference = envelope.input.financialAccountReference;
  if (typeof financialAccountReference !== "string" || !financialAccountReference.trim()) throw new Error("financialAccountReference is required.");
  const occurredAtInput = envelope.input.occurredAt;
  if (occurredAtInput !== undefined && typeof occurredAtInput !== "string") throw new Error("occurredAt must be a string.");

  const outcome = await clearInstrument({
    organizationId: envelope.executionContext.organizationId,
    instrumentId,
    paymentMethod,
    financialAccountReference,
    occurredAt: occurredAtInput ? new Date(occurredAtInput) : undefined,
    actorId: envelope.executionContext.actorId,
  });

  const entityRef = { entityType: "financial_instrument", entityId: instrumentId };

  let notificationDelivered = true;
  try {
    await notifyWithOwnerFanout({
      organizationId: envelope.executionContext.organizationId,
      actorUserId: envelope.executionContext.actorId,
      recipientUserId: envelope.executionContext.actorId,
      type: "financialInstrument.cleared",
      title: "Çek/senet tahsil/ödeme edildi",
      body: `${outcome.clearedAllocations.length} obligation için gerçek para hareketi kaydedildi.`,
      severity: "INFO",
      entityType: "FinancialInstrument",
      entityId: instrumentId,
    });
  } catch (cause) {
    notificationDelivered = false;
    await auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "financialInstrument.clear.notify",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "NOTIFICATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Notification delivery failed.",
      metadata: { instrumentId, critical: false },
    });
  }

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: "financialInstrument.clear completed.",
    metadata: {
      instrumentId,
      status: outcome.instrument.status,
      clearedAllocations: outcome.clearedAllocations,
      notificationDelivered,
    },
    domainEvents: [],
    sideEffects: [],
  };
};
