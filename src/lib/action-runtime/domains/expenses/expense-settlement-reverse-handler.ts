import { reverseExpenseSettlement } from "@/lib/core/expenses/expense-settlement.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { auditStore } from "../../audit";
import type { ActionHandler } from "../../execution";
import { buildExpenseSettlementReversedDomainEvent } from "./expense-domain-events";

/**
 * expense.settlement.reverse — settlement-reverse-handler.ts ile aynı desen.
 */
export const expenseSettlementReverseHandler: ActionHandler = async (envelope) => {
  const expenseSettlementId = envelope.input.expenseSettlementId;
  if (typeof expenseSettlementId !== "string" || !expenseSettlementId.trim()) throw new Error("expenseSettlementId is required.");
  if (envelope.entityRef?.entityType !== "expense_settlement" || envelope.entityRef.entityId !== expenseSettlementId) {
    throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  }
  const reason = envelope.input.reason;
  if (typeof reason !== "string" || !reason.trim()) throw new Error("reason is required.");

  const outcome = await reverseExpenseSettlement({
    organizationId: envelope.executionContext.organizationId,
    expenseSettlementId,
    reason,
    actorId: envelope.executionContext.actorId,
  });

  if (!outcome) {
    return { status: "FAILURE", errorMessage: "Expense settlement was not found in this organization." };
  }

  const entityRef = { entityType: "expense_settlement", entityId: expenseSettlementId };

  let notificationDelivered = true;
  try {
    await notifyWithOwnerFanout({
      organizationId: envelope.executionContext.organizationId,
      actorUserId: envelope.executionContext.actorId,
      recipientUserId: envelope.executionContext.actorId,
      type: "expense.settlement.reversed",
      title: "Gider ödemesi geri alındı",
      body: `${outcome.settlement.amount} ${outcome.settlement.currency} — ${reason}`,
      severity: "INFO",
      entityType: "Expense",
      entityId: outcome.expense.id,
    });
  } catch (cause) {
    notificationDelivered = false;
    await auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "expense.settlement.reverse.notify",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "NOTIFICATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Notification delivery failed.",
      metadata: { expenseSettlementId, critical: false },
    });
  }

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: "expense.settlement.reverse completed.",
    metadata: {
      expenseSettlementId,
      reversalExpenseSettlementId: outcome.settlement.id,
      movementId: outcome.movement.id,
      expenseId: outcome.expense.id,
      expenseStatus: outcome.expense.status,
      paidAmount: outcome.expense.paidAmount.toString(),
      notificationDelivered,
    },
    domainEvents: [
      buildExpenseSettlementReversedDomainEvent({
        originalExpenseSettlementId: expenseSettlementId,
        reversalExpenseSettlementId: outcome.settlement.id,
        movementId: outcome.movement.id,
        expenseId: outcome.expense.id,
        amount: outcome.settlement.amount.toString(),
        currency: outcome.settlement.currency,
        actorId: envelope.executionContext.actorId,
      }),
    ],
    sideEffects: [],
  };
};
