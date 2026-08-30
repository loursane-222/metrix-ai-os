import { confirmPurchaseInvoice } from "@/lib/core/purchase-invoices/purchase-invoice.service";
import { materializePurchaseInvoicePayableSchedule } from "@/lib/core/obligations/obligation-schedule.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { auditStore } from "../../audit";
import type { ActionHandler } from "../../execution";

/**
 * invoice-send-handler.ts ile birebir aynı desen (payable karşılığı):
 * purchaseInvoice.confirm, faturanın gerçekten ekonomik olarak geçerli hale
 * geldiği canonical sınırdır (confirmPurchaseInvoice zaten aynı transaction'da
 * ledger tanımasını yapıyor) — Commercial Term → Materialized Obligation
 * Schedule (Phase 5 authority, reuse) tam olarak burada, confirmPurchaseInvoice
 * başarıyla tamamlandıktan HEMEN sonra tetiklenir; DRAFT aşamasında asla
 * obligation yaratılmaz.
 *
 * NON-CRITICAL: confirmPurchaseInvoice() (status CONFIRMED + ledger
 * recognition) tek CRITICAL yan etkidir. Materialize ayrı bir transaction'dır
 * ve başarısız olursa purchaseInvoice.confirm'i BAŞARISIZ kılmaz.
 */
export const purchaseInvoiceConfirmHandler: ActionHandler = async (envelope) => {
  const purchaseInvoiceId = envelope.input.purchaseInvoiceId;
  if (typeof purchaseInvoiceId !== "string" || !purchaseInvoiceId.trim()) throw new Error("purchaseInvoiceId is required.");

  const purchaseInvoice = await confirmPurchaseInvoice({
    purchaseInvoiceId: purchaseInvoiceId.trim(),
    organizationId: envelope.executionContext.organizationId,
  });

  const entityRef = { entityType: "purchase_invoice", entityId: purchaseInvoice.id };

  let obligationMaterialized = false;
  try {
    await materializePurchaseInvoicePayableSchedule({
      organizationId: envelope.executionContext.organizationId,
      purchaseInvoiceId: purchaseInvoice.id,
      actorId: envelope.executionContext.actorId,
    });
    obligationMaterialized = true;
  } catch (cause) {
    await auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "purchaseInvoice.confirm.materializePayable",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "OBLIGATION_MATERIALIZATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Payable schedule materialization failed.",
      metadata: { purchaseInvoiceId: purchaseInvoice.id, critical: false },
    });
  }

  await notifyWithOwnerFanout({ organizationId: envelope.executionContext.organizationId, actorUserId: envelope.executionContext.actorId, type: "purchaseInvoice.confirmed", title: "Alış faturası onaylandı", body: purchaseInvoice.supplierInvoiceNumber, entityType: "PurchaseInvoice", entityId: purchaseInvoice.id });

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: "purchaseInvoice.confirm completed.",
    metadata: { purchaseInvoiceId: purchaseInvoice.id, changedFields: ["status"], obligationMaterialized },
    domainEvents: [],
    sideEffects: [],
  };
};
