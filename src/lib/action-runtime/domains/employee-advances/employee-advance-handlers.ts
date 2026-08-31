import { MoneyDirection, PaymentMethod } from "@prisma/client";
import { createNewEmployeeAdvance, moveEmployeeAdvance, reconcileEmployeeAdvance, reverseEmployeeAdvanceMovement, reverseEmployeeAdvanceReconciliation } from "@/lib/core/employee-advances/employee-advance.service";
import type { ActionHandler } from "../../execution";

export const employeeAdvanceCreateHandler: ActionHandler = async (envelope) => {
  const advance = await createNewEmployeeAdvance({
    organizationId: envelope.executionContext.organizationId,
    employeeMemberId: requiredString(envelope.input.employeeMemberId, "employeeMemberId"),
    amount: requiredNumber(envelope.input.amount, "amount"),
    currency: optionalString(envelope.input.currency),
    note: optionalString(envelope.input.note),
    actorId: envelope.executionContext.actorId,
  });
  return success("employee_advance", advance.id, "employeeAdvance.create completed.", { status: advance.status });
};

export const employeeAdvanceMoveHandler: ActionHandler = async (envelope) => {
  const employeeAdvanceId = requiredString(envelope.input.employeeAdvanceId, "employeeAdvanceId");
  const outcome = await moveEmployeeAdvance({
    organizationId: envelope.executionContext.organizationId,
    employeeAdvanceId,
    direction: requiredDirection(envelope.input.direction),
    amount: requiredNumber(envelope.input.amount, "amount"),
    paymentMethod: requiredPaymentMethod(envelope.input.paymentMethod),
    financialAccountReference: requiredString(envelope.input.financialAccountReference, "financialAccountReference"),
    occurredAt: optionalDate(envelope.input.occurredAt),
    idempotencyKey: optionalString(envelope.input.idempotencyKey),
    actorId: envelope.executionContext.actorId,
  });
  if (!outcome) return { status: "FAILURE", errorMessage: "EmployeeAdvance was not found in this organization." };
  return success("employee_advance", employeeAdvanceId, "employeeAdvance.move completed.", {
    status: outcome.employeeAdvance.status,
    movementId: outcome.movement.id,
    financialAccountMovementId: outcome.financialAccountMovement.id,
    replayed: outcome.replayed,
  });
};

export const employeeAdvanceMovementReverseHandler: ActionHandler = async (envelope) => {
  const employeeAdvanceMovementId = requiredString(envelope.input.employeeAdvanceMovementId, "employeeAdvanceMovementId");
  const outcome = await reverseEmployeeAdvanceMovement({
    organizationId: envelope.executionContext.organizationId,
    employeeAdvanceMovementId,
    reason: requiredString(envelope.input.reason, "reason"),
    occurredAt: optionalDate(envelope.input.occurredAt),
    actorId: envelope.executionContext.actorId,
  });
  if (!outcome) return { status: "FAILURE", errorMessage: "EmployeeAdvanceMovement was not found in this organization." };
  return success("employee_advance", outcome.employeeAdvance.id, "employeeAdvance.movement.reverse completed.", {
    status: outcome.employeeAdvance.status,
    reversalMovementId: outcome.movement.id,
  });
};

export const employeeAdvanceReconcileHandler: ActionHandler = async (envelope) => {
  const employeeAdvanceId = requiredString(envelope.input.employeeAdvanceId, "employeeAdvanceId");
  const outcome = await reconcileEmployeeAdvance({
    organizationId: envelope.executionContext.organizationId,
    employeeAdvanceId,
    expenseId: requiredString(envelope.input.expenseId, "expenseId"),
    amount: requiredNumber(envelope.input.amount, "amount"),
    occurredAt: optionalDate(envelope.input.occurredAt),
    idempotencyKey: optionalString(envelope.input.idempotencyKey),
    actorId: envelope.executionContext.actorId,
  });
  if (!outcome) return { status: "FAILURE", errorMessage: "EmployeeAdvance was not found in this organization." };
  return success("employee_advance", employeeAdvanceId, "employeeAdvance.reconcile completed.", {
    status: outcome.employeeAdvance.status,
    reconciliationId: outcome.reconciliation.id,
    replayed: outcome.replayed,
  });
};

export const employeeAdvanceReconciliationReverseHandler: ActionHandler = async (envelope) => {
  const employeeAdvanceReconciliationId = requiredString(envelope.input.employeeAdvanceReconciliationId, "employeeAdvanceReconciliationId");
  const outcome = await reverseEmployeeAdvanceReconciliation({
    organizationId: envelope.executionContext.organizationId,
    employeeAdvanceReconciliationId,
    reason: requiredString(envelope.input.reason, "reason"),
    occurredAt: optionalDate(envelope.input.occurredAt),
    actorId: envelope.executionContext.actorId,
  });
  if (!outcome) return { status: "FAILURE", errorMessage: "EmployeeAdvanceReconciliation was not found in this organization." };
  return success("employee_advance", outcome.employeeAdvance.id, "employeeAdvance.reconciliation.reverse completed.", {
    status: outcome.employeeAdvance.status,
    reversalReconciliationId: outcome.reconciliation.id,
  });
};

function success(entityType: string, entityId: string, resultSummary: string, metadata: Record<string, unknown>) {
  return { status: "SUCCESS" as const, entityRef: { entityType, entityId }, resultSummary, metadata, domainEvents: [], sideEffects: [] };
}
function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a number.`);
  return value;
}
function optionalDate(value: unknown): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error("occurredAt must be a string.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("occurredAt must be a valid date.");
  return date;
}
function requiredPaymentMethod(value: unknown): PaymentMethod {
  if (typeof value !== "string" || !Object.values(PaymentMethod).includes(value as PaymentMethod)) {
    throw new Error("paymentMethod must be one of " + Object.values(PaymentMethod).join(", ") + ".");
  }
  return value as PaymentMethod;
}
function requiredDirection(value: unknown): MoneyDirection {
  if (value !== "OUT" && value !== "IN") throw new Error("direction must be OUT (disbursement) or IN (return).");
  return value;
}
