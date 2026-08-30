import { applyInstrumentToObligation } from "@/lib/core/financial-instruments/financial-instrument.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

export async function handleFinancialInstrumentApply(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const instrumentId = requiredString(envelope.input.instrumentId, "instrumentId");
  const obligationScheduleLineId = requiredString(envelope.input.obligationScheduleLineId, "obligationScheduleLineId");
  const amount = envelope.input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new Error("amount must be a positive number.");

  // CRITICAL side effect — its failure is the handler's failure. Never
  // moves money; only records the allocation and, on first application,
  // advances the instrument to ALLOCATED.
  const outcome = await applyInstrumentToObligation({
    organizationId: envelope.executionContext.organizationId,
    instrumentId,
    obligationScheduleLineId,
    amount,
    actorId: envelope.executionContext.actorId,
  });

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "financialInstrument.applied", title: "Enstrüman obligation'a uygulandı", body: `${amount} ${outcome.instrument.currency}`, entityType: "FinancialInstrument", entityId: instrumentId });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "financial_instrument", entityId: instrumentId },
    resultSummary: "financialInstrument.applyToObligation completed.",
    metadata: { instrumentId, obligationScheduleLineId, allocationId: outcome.allocation.id, instrumentStatus: outcome.instrument.status },
    domainEvents: [],
    sideEffects: [],
  };
}
