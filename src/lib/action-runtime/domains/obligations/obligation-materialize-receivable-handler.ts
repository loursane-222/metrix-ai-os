import { materializeReceivableSchedule } from "@/lib/core/obligations/obligation-schedule.service";
import type { ActionHandler } from "../../execution";

/**
 * obligation.materializeReceivable — Commercial Term → Materialized
 * Obligation Schedule (Phase 5), receivable tarafı. Yalnız gerçek bir
 * commercial fact (SENT/PAID Invoice) için çağrılabilir; DRAFT/CANCELLED
 * reddedilir. Para hareketi ÜRETMEZ — yalnız schedule satırlarını ve boş
 * Payment kabuklarını yaratır; gerçek tahsilat yine payment.apply
 * (Phase 3) üzerinden olur.
 */
export const obligationMaterializeReceivableHandler: ActionHandler = async (envelope) => {
  const invoiceId = envelope.input.invoiceId;
  if (typeof invoiceId !== "string" || !invoiceId.trim()) throw new Error("invoiceId is required.");
  if (envelope.entityRef?.entityType !== "invoice" || envelope.entityRef.entityId !== invoiceId) {
    throw new Error("ACTION_TARGET_CONTEXT_MISMATCH");
  }

  const outcome = await materializeReceivableSchedule({
    organizationId: envelope.executionContext.organizationId,
    invoiceId,
    actorId: envelope.executionContext.actorId,
  });

  return {
    status: "SUCCESS",
    entityRef: { entityType: "invoice", entityId: invoiceId },
    resultSummary: "obligation.materializeReceivable completed.",
    metadata: {
      invoiceId,
      lineCount: outcome.lines.length,
      lineIds: outcome.lines.map((line) => line.id),
      paymentIds: outcome.payments.map((payment) => payment.id),
    },
    domainEvents: [],
    sideEffects: [],
  };
};
