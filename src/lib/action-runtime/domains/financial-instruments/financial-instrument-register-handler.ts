import { InstrumentDirection, InstrumentType } from "@prisma/client";
import { registerInstrument } from "@/lib/core/financial-instruments/financial-instrument.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

function requiredEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${field} must be one of: ${allowed.join(", ")}.`);
  return value as T;
}
function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function requiredDate(value: unknown, field: string): Date {
  if (typeof value !== "string") throw new Error(`${field} is required.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid date.`);
  return date;
}

export async function handleFinancialInstrumentRegister(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const instrumentType = requiredEnum(envelope.input.instrumentType, "instrumentType", Object.values(InstrumentType));
  const direction = requiredEnum(envelope.input.direction, "direction", Object.values(InstrumentDirection));
  const amount = envelope.input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new Error("amount must be a positive number.");
  const maturityDate = requiredDate(envelope.input.maturityDate, "maturityDate");
  const issueDateInput = envelope.input.issueDate;
  const issueDate = typeof issueDateInput === "string" ? requiredDate(issueDateInput, "issueDate") : undefined;

  // CRITICAL side effect — its failure is the handler's failure. This
  // ONLY records the instrument's existence; it never moves money.
  const instrument = await registerInstrument({
    organizationId: envelope.executionContext.organizationId,
    instrumentType,
    direction,
    customerId: optionalString(envelope.input.customerId),
    supplierId: optionalString(envelope.input.supplierId),
    amount,
    currency: optionalString(envelope.input.currency),
    issueDate,
    maturityDate,
    instrumentNumber: optionalString(envelope.input.instrumentNumber),
    bankName: optionalString(envelope.input.bankName),
    branchName: optionalString(envelope.input.branchName),
    drawerName: optionalString(envelope.input.drawerName),
    notes: optionalString(envelope.input.notes),
    actorId: envelope.executionContext.actorId,
  });

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "financialInstrument.registered", title: direction === "RECEIVED" ? "Çek/senet alındı" : "Çek/senet verildi", body: `${instrumentType} — ${amount} ${instrument.currency}`, entityType: "FinancialInstrument", entityId: instrument.id });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "financial_instrument", entityId: instrument.id },
    resultSummary: "Financial instrument registered (REGISTERED — no money moved).",
    metadata: { instrumentId: instrument.id },
    domainEvents: [],
    sideEffects: [],
  };
}
