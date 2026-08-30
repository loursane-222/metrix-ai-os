import { sendInvoice } from "@/lib/core/invoices/invoice.service";
import { materializeReceivableSchedule } from "@/lib/core/obligations/obligation-schedule.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { auditStore } from "../../audit";
import type { ActionHandler } from "../../execution";

/**
 * Internal DRAFT -> SENT transition only; no e-Fatura or external delivery.
 *
 * invoice.send, faturanın gerçekten ekonomik olarak geçerli hale geldiği
 * canonical sınırdır (recordInvoiceSent zaten burada, aynı sendInvoice
 * transaction'ında ledger tanımasını yapıyor) — bu yüzden Commercial Term
 * → Materialized Obligation Schedule (Phase 5) tam olarak burada, sendInvoice
 * başarıyla tamamlandıktan HEMEN sonra tetiklenir; DRAFT aşamasında asla
 * obligation yaratılmaz (invoice.create bunu hiç çağırmaz).
 *
 * NON-CRITICAL: sendInvoice() (status SENT + ledger recognition) tek
 * CRITICAL yan etkidir — kendi transaction'ı içinde, değişmeden kalır.
 * Materialize ayrı bir transaction'dır ve başarısız olursa (örn. invoice'ın
 * customerId'si yok, veya structured term eksik bir reference date
 * istiyor) invoice.send'i BAŞARISIZ kılmaz — fatura yine de gönderilmiş
 * sayılır, schedule sonradan obligation.materializeReceivable ile manuel
 * tamamlanabilir. notifyWithOwnerFanout'un kendi (önceden var olan,
 * sarmalanmamış) davranışı bilerek değiştirilmedi — bu review'ın kapsamı
 * dışında bir bug fix olurdu; materialize bu yüzden ondan ÖNCE çalıştırılır
 * ki notify'ın olası hatası materialize'ı hiç etkilemesin.
 *
 * referenceDate = invoice.updatedAt: sendInvoice'ın kendi dönüşünden gelen,
 * DRAFT→SENT geçişinin gerçekleştiği tam an — "materialize anı" değil.
 */
export const invoiceSendHandler: ActionHandler = async (envelope) => {
  const invoiceId = envelope.input.invoiceId;
  if (typeof invoiceId !== "string" || !invoiceId.trim()) throw new Error("invoiceId is required.");

  const invoice = await sendInvoice({
    invoiceId: invoiceId.trim(),
    organizationId: envelope.executionContext.organizationId,
  });

  const entityRef = { entityType: "invoice", entityId: invoice.id };

  let obligationMaterialized = false;
  let obligationLineCount = 0;
  try {
    const outcome = await materializeReceivableSchedule({
      organizationId: envelope.executionContext.organizationId,
      invoiceId: invoice.id,
      actorId: envelope.executionContext.actorId,
      referenceDate: invoice.updatedAt,
    });
    obligationMaterialized = true;
    obligationLineCount = outcome.lines.length;
  } catch (cause) {
    await auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "invoice.send.materializeReceivable",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "OBLIGATION_MATERIALIZATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Receivable schedule materialization failed.",
      metadata: { invoiceId: invoice.id, critical: false },
    });
  }

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "invoice.sent", title: "Fatura gönderildi", body: invoice.invoiceNumber, entityType: "Invoice", entityId: invoice.id });

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: "invoice.send completed.",
    metadata: { invoiceId: invoice.id, changedFields: ["status"], obligationMaterialized, obligationLineCount },
    domainEvents: [],
    sideEffects: [],
  };
};
