import { materializePayableSchedule } from "@/lib/core/obligations/obligation-schedule.service";
import type { ActionHandler } from "../../execution";

/**
 * obligation.materializePayable — payable tarafı. Bir Expense için tek
 * ObligationScheduleLine üretir (Expense multi-installment değildir, Phase
 * 4). Para hareketi ÜRETMEZ; gerçek ödeme expense.settle üzerinden olur.
 */
export const obligationMaterializePayableHandler: ActionHandler = async (envelope) => {
  const expenseId = envelope.input.expenseId;
  if (typeof expenseId !== "string" || !expenseId.trim()) throw new Error("expenseId is required.");
  if (envelope.entityRef?.entityType !== "expense" || envelope.entityRef.entityId !== expenseId) {
    throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  }
  const dueDateInput = envelope.input.dueDate;
  if (typeof dueDateInput !== "string" || !dueDateInput.trim()) throw new Error("dueDate is required.");
  const dueDate = new Date(dueDateInput);
  if (Number.isNaN(dueDate.getTime())) throw new Error("dueDate must be a valid date.");

  const outcome = await materializePayableSchedule({
    organizationId: envelope.executionContext.organizationId,
    expenseId,
    dueDate,
    actorId: envelope.executionContext.actorId,
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "expense", entityId: expenseId },
    resultSummary: "obligation.materializePayable completed.",
    metadata: { expenseId, lineId: outcome.line.id },
    domainEvents: [],
    sideEffects: [],
  };
};
