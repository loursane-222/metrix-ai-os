import { cancelInstrument } from "@/lib/core/financial-instruments/financial-instrument.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import type { ActionExecutionEnvelope, HandlerResult } from "../../execution";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

export async function handleFinancialInstrumentCancel(envelope: ActionExecutionEnvelope): Promise<HandlerResult> {
  const instrumentId = requiredString(envelope.input.instrumentId, "instrumentId");
  const reason = requiredString(envelope.input.reason, "reason");

  // CRITICAL side effect — only a REGISTERED (never applied/settled/
  // bounced) instrument can be cancelled.
  const instrument = await cancelInstrument({ organizationId: envelope.executionContext.organizationId, instrumentId, reason, actorId: envelope.executionContext.actorId });

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "financialInstrument.cancelled", title: "Çek/senet kaydı iptal edildi", body: reason, entityType: "FinancialInstrument", entityId: instrumentId });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "financial_instrument", entityId: instrumentId },
    resultSummary: "financialInstrument.cancel completed.",
    metadata: { instrumentId, status: instrument.status },
    domainEvents: [],
    sideEffects: [],
  };
}
