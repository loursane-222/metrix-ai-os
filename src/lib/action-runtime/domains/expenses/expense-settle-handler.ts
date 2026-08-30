import { PaymentMethod } from "@prisma/client";
import { settleExpense } from "@/lib/core/expenses/expense-settlement.service";
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
 * expense.settle — payment-apply-handler.ts ile aynı critical/non-critical
 * yan etki ayrımı: settleExpense() (canonical ExpenseSettlement+
 * FinancialAccountMovement yazımı) tek CRITICAL yan etkidir.
 */
export const expenseSettleHandler: ActionHandler = async (envelope) => {
  const expenseId = envelope.input.expenseId;
  if (typeof expenseId !== "string" || !expenseId.trim()) throw new Error("expenseId is required.");
  if (envelope.entityRef?.entityType !== "expense" || envelope.entityRef.entityId !== expenseId) {
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

  const outcome = await settleExpense({
    organizationId: envelope.executionContext.organizationId,
    expenseId,
    amount,
    paymentMethod,
    financialAccountReference,
    occurredAt: occurredAtInput ? new Date(occurredAtInput) : undefined,
    idempotencyKey: idempotencyKeyInput,
    actorId: envelope.executionContext.actorId,
  });

  if (!outcome) {
    return { status: "FAILURE", errorMessage: "Expense was not found in this organization." };
  }

  const { expense } = outcome;
  const entityRef = { entityType: "expense", entityId: expenseId };

  let notificationDelivered = true;
  try {
    await notifyWithOwnerFanout({
      organizationId: envelope.executionContext.organizationId,
      actorUserId: envelope.executionContext.actorId,
      recipientUserId: envelope.executionContext.actorId,
      type: "expense.settled",
      title: expense.status === "PAID" ? "Gider ödemesi tamamlandı" : "Kısmi gider ödemesi kaydedildi",
      body: `${expense.title} — ${amount} ${expense.currency}`,
      severity: "INFO",
      entityType: "Expense",
      entityId: expenseId,
    });
  } catch (cause) {
    notificationDelivered = false;
    await auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "expense.settle.notify",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "NOTIFICATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Notification delivery failed.",
      metadata: { expenseId, critical: false },
    });
  }

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: "expense.settle completed.",
    metadata: {
      expenseId,
      status: expense.status,
      paidAmount: expense.paidAmount.toString(),
      settlementId: outcome.settlement.id,
      movementId: outcome.movement.id,
      replayed: outcome.replayed,
      notificationDelivered,
    },
    domainEvents: [],
    sideEffects: [],
  };
};
