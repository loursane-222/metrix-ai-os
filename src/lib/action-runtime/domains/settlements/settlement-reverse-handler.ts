import { reverseSettlement } from "@/lib/core/settlements/settlement.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { auditStore } from "../../audit";
import type { ActionHandler } from "../../execution";
import { buildSettlementReversedDomainEvent } from "./settlement-domain-events";

/**
 * settlement.reverse — reference implementation, aynı critical/non-critical
 * yan etki ayrımını payment.apply ile paylaşır: reverseSettlement()
 * (canonical Settlement+Application+Movement+Payment+Ledger yazımı) tek
 * CRITICAL yan etkidir. Bildirim NON-CRITICAL: kendi try/catch'i vardır,
 * başarısızlığı işlemi başarısız kılmaz.
 */
export const settlementReverseHandler: ActionHandler = async (envelope) => {
  const settlementId = envelope.input.settlementId;
  if (typeof settlementId !== "string" || !settlementId.trim()) throw new Error("settlementId is required.");
  if (envelope.entityRef?.entityType !== "settlement" || envelope.entityRef.entityId !== settlementId) {
    throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  }
  const reason = envelope.input.reason;
  if (typeof reason !== "string" || !reason.trim()) throw new Error("reason is required.");

  const outcome = await reverseSettlement({
    organizationId: envelope.executionContext.organizationId,
    settlementId,
    reason,
    actorId: envelope.executionContext.actorId,
  });

  if (!outcome) {
    return { status: "FAILURE", errorMessage: "Settlement was not found in this organization." };
  }

  const entityRef = { entityType: "settlement", entityId: settlementId };

  let notificationDelivered = true;
  try {
    await notifyWithOwnerFanout({
      organizationId: envelope.executionContext.organizationId,
      actorUserId: envelope.executionContext.actorId,
      recipientUserId: envelope.executionContext.actorId,
      type: "settlement.reversed",
      title: "Tahsilat geri alındı",
      body: `${outcome.settlement.amount} ${outcome.settlement.currency} — ${reason}`,
      severity: "INFO",
      entityType: "Payment",
      entityId: outcome.payment.id,
    });
  } catch (cause) {
    notificationDelivered = false;
    await auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "settlement.reverse.notify",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "NOTIFICATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Notification delivery failed.",
      metadata: { settlementId, critical: false },
    });
  }

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: "settlement.reverse completed.",
    metadata: {
      settlementId,
      reversalSettlementId: outcome.settlement.id,
      applicationId: outcome.application.id,
      movementId: outcome.movement.id,
      paymentId: outcome.payment.id,
      paymentStatus: outcome.payment.status,
      paidAmount: outcome.payment.paidAmount.toString(),
      notificationDelivered,
    },
    domainEvents: [
      buildSettlementReversedDomainEvent({
        originalSettlementId: settlementId,
        reversalSettlementId: outcome.settlement.id,
        applicationId: outcome.application.id,
        movementId: outcome.movement.id,
        paymentId: outcome.payment.id,
        amount: outcome.settlement.amount.toString(),
        currency: outcome.settlement.currency,
        actorId: envelope.executionContext.actorId,
      }),
    ],
    sideEffects: [],
  };
};
