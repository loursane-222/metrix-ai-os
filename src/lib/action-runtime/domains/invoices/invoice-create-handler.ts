import { createNewInvoice } from "@/lib/core/invoices/invoice.service";
import { notifyWithOwnerFanout } from "@/lib/core/notifications";
import { createApprovedMemoryItem } from "@/lib/core/memory-items/memory-item.service";
import { auditStore } from "../../audit";
import type { ActionHandler } from "../../execution";
import { buildInvoiceCreatedDomainEvent } from "./invoice-domain-events";

/**
 * Reference implementation handler for the Invoice capability, following the
 * exact same critical/non-critical side-effect split as taskCreateHandler:
 * createNewInvoice() (the canonical Prisma write) is the sole CRITICAL side
 * effect — its success/failure is this handler's success/failure.
 * Notification and Executive Memory are NON-CRITICAL: they run after the
 * Invoice row is already committed, are individually try/caught, and a
 * failure in either is recorded as its own audit entry plus surfaced in the
 * returned metadata (notificationDelivered/memoryRecorded) rather than
 * failing or hiding the overall action.
 */
export const invoiceCreateHandler: ActionHandler = async (envelope) => {
  const customerId = envelope.input.customerId;
  if (typeof customerId !== "string" || !customerId.trim()) throw new Error("customerId is required.");
  const title = envelope.input.title;
  if (typeof title !== "string" || !title.trim()) throw new Error("title is required.");
  const amount = envelope.input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) throw new Error("amount must be a positive number.");

  const quoteId = envelope.input.quoteId;
  if (quoteId !== undefined && typeof quoteId !== "string") throw new Error("quoteId must be a string.");
  const taxRate = envelope.input.taxRate;
  if (taxRate !== undefined && typeof taxRate !== "number") throw new Error("taxRate must be a number.");
  const currency = envelope.input.currency;
  if (currency !== undefined && typeof currency !== "string") throw new Error("currency must be a string.");
  const invoiceNumber = envelope.input.invoiceNumber;
  if (invoiceNumber !== undefined && (typeof invoiceNumber !== "string" || !invoiceNumber.trim())) throw new Error("invoiceNumber must be a non-empty string.");
  const dueDateInput = envelope.input.dueDate;
  if (dueDateInput !== undefined && typeof dueDateInput !== "string") throw new Error("dueDate must be a string.");
  const dueDate = dueDateInput ? new Date(dueDateInput) : undefined;
  if (dueDate && Number.isNaN(dueDate.getTime())) throw new Error("dueDate must be a valid date.");

  // CRITICAL side effect — its failure is the handler's failure.
  const { invoice } = await createNewInvoice({
    organizationId: envelope.executionContext.organizationId,
    customerId,
    title: title.trim(),
    amount,
    quoteId: quoteId || undefined,
    taxRate,
    currency,
    invoiceNumber,
    dueDate,
    idempotencyKey: envelope.idempotencyKey,
  });

  const entityRef = { entityType: "invoice", entityId: invoice.id };

  // NON-CRITICAL side effect #1 — recorded, never allowed to fail the action.
  let notificationDelivered = true;
  try {
    await notifyWithOwnerFanout({
      organizationId: envelope.executionContext.organizationId,
      actorUserId: envelope.executionContext.actorId,
      recipientUserId: envelope.executionContext.actorId,
      type: "invoice.created",
      title: "Yeni fatura oluşturuldu",
      body: `${invoice.title} — ${invoice.invoiceNumber}`,
      severity: "INFO",
      entityType: "Invoice",
      entityId: invoice.id,
    });
  } catch (cause) {
    notificationDelivered = false;
    auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "invoice.create.notify",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "NOTIFICATION_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Notification delivery failed.",
      metadata: { invoiceId: invoice.id, critical: false },
    });
  }

  // NON-CRITICAL side effect #2 — recorded, never allowed to fail the action.
  let memoryRecorded = true;
  try {
    await createApprovedMemoryItem({
      organizationId: envelope.executionContext.organizationId,
      createdByUserId: envelope.executionContext.actorId,
      subjectType: "ORGANIZATION",
      type: "FACT",
      key: `invoice.created.${invoice.id}`,
      value: `Fatura kesildi: "${invoice.title}" (${invoice.invoiceNumber}), ${invoice.totalAmount.toString()} ${invoice.currency}.`,
      source: "EVENT_DERIVED",
      confidence: 0.9,
      isUserConfirmed: false,
      metadata: { invoiceId: invoice.id, amount: invoice.totalAmount.toString() },
    });
  } catch (cause) {
    memoryRecorded = false;
    auditStore.append({
      recordType: "ACTION_RESULT",
      actionName: "invoice.create.memory",
      actorId: envelope.executionContext.actorId,
      organizationId: envelope.executionContext.organizationId,
      entityRef,
      outcome: "FAILED",
      reasonCode: "MEMORY_SIDE_EFFECT_FAILED",
      resultSummary: cause instanceof Error ? cause.message : "Executive Memory write failed.",
      metadata: { invoiceId: invoice.id, critical: false },
    });
  }

  return {
    status: "SUCCESS",
    entityRef,
    resultSummary: "invoice.create completed.",
    metadata: { invoiceId: invoice.id, changedFields: [...Object.keys(envelope.input)], notificationDelivered, memoryRecorded },
    domainEvents: [buildInvoiceCreatedDomainEvent(invoice.id, envelope.executionContext.actorId)],
    sideEffects: [],
  };
};
