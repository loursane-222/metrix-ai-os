import { bounceInstrument } from "@/lib/core/financial-instruments/financial-instrument.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

export async function handleFinancialInstrumentBounce(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const instrumentId = requiredString(envelope.input.instrumentId, "instrumentId");
  const reason = requiredString(envelope.input.reason, "reason");

  // CRITICAL side effect — reverses every active allocation (new REVERSAL
  // rows, originals untouched), correctly reopening the underlying
  // receivable/payable obligation. "Çek karşılıksız çıktı" is exactly this.
  const instrument = await bounceInstrument({ organizationId: envelope.executionContext.organizationId, instrumentId, reason, actorId: envelope.executionContext.actorId });

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "financialInstrument.bounced", title: "Çek/senet karşılıksız", body: reason, severity: "WARNING", entityType: "FinancialInstrument", entityId: instrumentId });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "financial_instrument", entityId: instrumentId },
    resultSummary: "financialInstrument.bounce completed; obligation reopened.",
    metadata: { instrumentId, status: instrument.status },
    domainEvents: [],
    sideEffects: [],
  };
}
