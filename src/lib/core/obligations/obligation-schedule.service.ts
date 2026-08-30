import type { Expense, ObligationScheduleLine, Payment } from "@prisma/client";

import { ApiValidationError } from "@/lib/api/validation";
import { isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { findInvoiceById } from "@/lib/core/invoices/invoice.repository";
import { createPayment, findPaymentByIdForOrganization } from "@/lib/core/payments/payment.repository";
import { findExpenseByIdForOrganization } from "@/lib/core/expenses/expense-repository";
import { findPurchaseInvoiceById } from "@/lib/core/purchase-invoices/purchase-invoice.repository";
import {
  PaymentTermValidationError,
  materializePaymentTerm,
  parseStructuredPaymentTerm,
  type StructuredPaymentTerm,
} from "@/lib/payment-terms";

import { assertMaterializableExpenseStatus, assertMaterializableInvoiceStatus, assertMaterializablePurchaseInvoiceStatus, trivialTermFromDueDate } from "./obligation-schedule.contract";
import { createObligationScheduleLine, findObligationScheduleLinesForSource } from "./obligation-schedule.repository";
import type {
  MaterializePayableScheduleInput,
  MaterializePayableScheduleOutcome,
  MaterializePurchaseInvoicePayableScheduleInput,
  MaterializePurchaseInvoicePayableScheduleOutcome,
  MaterializeReceivableScheduleInput,
  MaterializeReceivableScheduleOutcome,
} from "./obligation-schedule.types";

/**
 * Commercial Term → Materialized Obligation Schedule (Phase 5), receivable
 * tarafı. Var olan bir SENT/PAID Invoice'ın (paymentTermSnapshot varsa onu,
 * yoksa düz dueDate'inden sentezlenen triviyal tek-bileşenli terimi)
 * gerçek, kalıcı ObligationScheduleLine satırlarına ve — her bileşen için
 * — Phase 1-3 authority'sinin zaten anladığı boş bir Payment kabuğuna
 * materialize eder. Materialize etmenin kendisi PARA HAREKETİ ÜRETMEZ.
 *
 * İki çağrı yolu:
 * 1. invoice-send-handler.ts'den, invoice.send'in NON-CRITICAL bir devamı
 *    olarak — gerçek "ekonomik olarak geçerli oldu" sınırı budur
 *    (sendInvoice zaten aynı anda kendi ledger tanıma adımını
 *    yapıyor). referenceDate orada invoice.updatedAt (send transition'ın
 *    kendi anı) olarak geçirilir.
 * 2. Standalone (backfill / henüz materialize edilmemiş eski SENT
 *    invoice'lar için) — referenceDate verilmezse invoice.updatedAt'a
 *    düşer, ASLA "materialize anı" olan new Date()'e değil.
 *
 * Idempotency: pre-check hızlı yoldur; gerçek doğruluk kaynağı DB'nin
 * (organizationId, sourceType, sourceId, componentIndex) unique
 * constraint'idir — rastgele bir retry key'ine değil, source+component'ın
 * kendi deterministik kimliğine bağlıdır. Çakışma yakalanırsa yeni satır
 * ÜRETİLMEZ, var olan schedule replay edilir.
 */
export async function materializeReceivableSchedule(input: MaterializeReceivableScheduleInput): Promise<MaterializeReceivableScheduleOutcome> {
  try {
    return await prisma.$transaction((tx) => performMaterializeReceivable(tx, input));
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) {
      const existing = await findObligationScheduleLinesForSource(input.organizationId, "INVOICE", input.invoiceId);
      if (existing.length > 0) return replayReceivableSchedule(existing);
    }
    throw error;
  }
}

async function performMaterializeReceivable(tx: PrismaTransactionClient, input: MaterializeReceivableScheduleInput): Promise<MaterializeReceivableScheduleOutcome> {
  const invoice = await findInvoiceById(input.invoiceId, input.organizationId, tx);
  if (!invoice) throw new ApiValidationError("Invoice not found.", 404);
  assertMaterializableInvoiceStatus(invoice.status);
  if (!invoice.customerId) throw new ApiValidationError("invoice has no customer; a receivable requires a known debtor.", 409);

  const existing = await findObligationScheduleLinesForSource(input.organizationId, "INVOICE", invoice.id, tx);
  if (existing.length > 0) throw new ApiValidationError("this invoice's receivable schedule has already been materialized.", 409);

  const term: StructuredPaymentTerm = invoice.paymentTermSnapshot ? parseTermOrThrow(invoice.paymentTermSnapshot) : trivialTermFromDueDate(invoice.dueDate);
  const totalCents = BigInt(Math.round(Number(invoice.totalAmount) * 100));
  // Materialize anı DEĞİL: invoice'ın kendi gerçek/canonical tarihi.
  // Çağıran (invoice-send-handler) send transition'ın tam anını
  // (invoice.updatedAt, sendInvoice'ın kendi dönüşünden) verir; standalone
  // çağrılarda invoice'ın mevcut updatedAt'ı kullanılır — new Date() asla
  // fabrikasyon olarak kullanılmaz.
  const referenceDate = input.referenceDate ?? invoice.updatedAt;

  let materialized;
  try {
    materialized = materializePaymentTerm({ term, totalCents, currency: invoice.currency, references: { INVOICE_DATE: referenceDate } });
  } catch (error) {
    throw toApiValidationError(error);
  }

  const lines: ObligationScheduleLine[] = [];
  const payments: Payment[] = [];
  for (const component of materialized) {
    const amount = Number(component.amountCents) / 100;
    const termComponent = term.components[component.componentIndex]!;
    const payment = await createPayment(
      {
        organizationId: input.organizationId,
        customerId: invoice.customerId,
        personId: null,
        quoteId: invoice.quoteId,
        invoiceId: invoice.id,
        title: term.components.length > 1 ? `${invoice.title} — Taksit ${component.componentIndex + 1}/${term.components.length}` : invoice.title,
        amount,
        currency: invoice.currency,
        dueDate: new Date(`${component.dueDate}T00:00:00.000Z`),
      },
      tx,
    );
    const line = await createObligationScheduleLine(
      {
        organizationId: input.organizationId,
        direction: "RECEIVABLE",
        sourceType: "INVOICE",
        sourceId: invoice.id,
        componentIndex: component.componentIndex,
        allocationType: termComponent.allocationType,
        maturityBasis: termComponent.maturityBasis,
        referenceDateType: termComponent.maturityBasis === "DAYS_AFTER_REFERENCE" ? termComponent.referenceDateType : null,
        dueDate: new Date(`${component.dueDate}T00:00:00.000Z`),
        originalAmount: amount,
        currency: invoice.currency,
        paymentId: payment.id,
        actorId: input.actorId,
      },
      tx,
    );
    lines.push(line);
    payments.push(payment);
  }

  return { lines, payments, replayed: false };
}

async function replayReceivableSchedule(existingLines: ObligationScheduleLine[]): Promise<MaterializeReceivableScheduleOutcome> {
  const payments = await Promise.all(
    existingLines.map(async (line) => {
      if (!line.paymentId) throw new ApiValidationError("Idempotency key conflict detected but the original payment could not be found.", 500);
      const payment = await findPaymentByIdForOrganization(line.paymentId, line.organizationId);
      if (!payment) throw new ApiValidationError("Idempotency key conflict detected but the original payment could not be found.", 500);
      return payment;
    }),
  );
  return { lines: existingLines, payments, replayed: true };
}

/**
 * Payable tarafı — Expense'in kendisi tek bir obligation'dır (Phase 4,
 * multi-installment değil), bu yüzden her zaman tam olarak bir
 * ObligationScheduleLine üretir. Gerçek ödeme yine yalnız
 * expense.settle (Phase 4/ExpenseSettlement) üzerinden olur.
 *
 * Bilerek standalone/açık action olarak kalır — createExpense'e
 * bağlanmaz: CreateExpenseInput/Expense'in hiçbir due-date alanı yoktur
 * (expense-repository.ts/expense.types.ts'te doğrulandı; yalnız
 * "ne zaman incurred olundu" bilgisi tutan expenseDate vardır, "ne zaman
 * ödenecek" değil). Var olmayan bir dueDate'i otomatik akışta uydurmak
 * "Historical veriye bilinmeyen ... schedule uydurma" kuralını ihlal eder
 * — bu yüzden dueDate her zaman çağıranın (bu action'ın) açık girdisidir.
 */
export async function materializePayableSchedule(input: MaterializePayableScheduleInput): Promise<MaterializePayableScheduleOutcome> {
  if (!(input.dueDate instanceof Date) || Number.isNaN(input.dueDate.getTime())) {
    throw new ApiValidationError("dueDate must be a valid date.", 400);
  }
  try {
    return await prisma.$transaction((tx) => performMaterializePayable(tx, input));
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) {
      const existing = await findObligationScheduleLinesForSource(input.organizationId, "EXPENSE", input.expenseId);
      if (existing.length > 0) {
        const expense = await findExpenseByIdForOrganization(input.expenseId, input.organizationId);
        if (expense) return { line: existing[0]!, expense, replayed: true };
      }
    }
    throw error;
  }
}

async function performMaterializePayable(tx: PrismaTransactionClient, input: MaterializePayableScheduleInput): Promise<MaterializePayableScheduleOutcome> {
  const expense = await findExpenseByIdForOrganization(input.expenseId, input.organizationId, tx);
  if (!expense) throw new ApiValidationError("Expense not found.", 404);
  assertMaterializableExpenseStatus(expense.status);

  const existing = await findObligationScheduleLinesForSource(input.organizationId, "EXPENSE", expense.id, tx);
  if (existing.length > 0) throw new ApiValidationError("this expense's payable schedule has already been materialized.", 409);

  const line = await createObligationScheduleLine(
    {
      organizationId: input.organizationId,
      direction: "PAYABLE",
      sourceType: "EXPENSE",
      sourceId: expense.id,
      componentIndex: 0,
      allocationType: "REMAINDER",
      maturityBasis: "FIXED_DATE",
      referenceDateType: null,
      dueDate: input.dueDate,
      originalAmount: Number(expense.amount),
      currency: expense.currency,
      expenseId: expense.id,
      actorId: input.actorId,
    },
    tx,
  );

  return { line, expense, replayed: false };
}

/**
 * Phase 9 — materializePayableSchedule'ın (Expense) PurchaseInvoice aynası.
 * Expense'in tekil REMAINDER/FIXED_DATE deseniyle AYNI: PurchaseInvoice çok
 * bileşenli structured payment term taşımaz (sales Invoice'ın aksine),
 * yalnız kendi dueDate'inden tek bir bileşen materialize edilir — mevcut,
 * kanıtlanmış deseni tekrar kullanır, yeni bir "purchase obligation"
 * otoritesi icat etmez.
 *
 * confirmPurchaseInvoice'un (invoice.send'in payable karşılığı) NON-CRITICAL
 * devamı olarak çağrılır — DRAFT aşamasında obligation yaratılmaz.
 */
export async function materializePurchaseInvoicePayableSchedule(input: MaterializePurchaseInvoicePayableScheduleInput): Promise<MaterializePurchaseInvoicePayableScheduleOutcome> {
  try {
    return await prisma.$transaction((tx) => performMaterializePurchaseInvoicePayable(tx, input));
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) {
      const existing = await findObligationScheduleLinesForSource(input.organizationId, "PURCHASE_INVOICE", input.purchaseInvoiceId);
      if (existing.length > 0) {
        const purchaseInvoice = await findPurchaseInvoiceById(input.purchaseInvoiceId, input.organizationId);
        if (purchaseInvoice) return { line: existing[0]!, purchaseInvoice, replayed: true };
      }
    }
    throw error;
  }
}

async function performMaterializePurchaseInvoicePayable(tx: PrismaTransactionClient, input: MaterializePurchaseInvoicePayableScheduleInput): Promise<MaterializePurchaseInvoicePayableScheduleOutcome> {
  const purchaseInvoice = await findPurchaseInvoiceById(input.purchaseInvoiceId, input.organizationId, tx);
  if (!purchaseInvoice) throw new ApiValidationError("PurchaseInvoice not found.", 404);
  assertMaterializablePurchaseInvoiceStatus(purchaseInvoice.status);

  const existing = await findObligationScheduleLinesForSource(input.organizationId, "PURCHASE_INVOICE", purchaseInvoice.id, tx);
  if (existing.length > 0) throw new ApiValidationError("this purchase invoice's payable schedule has already been materialized.", 409);

  // dueDate yoksa IMMEDIATE'e düşer — trivialTermFromDueDate'in ürettiği
  // FIXED_DATE bileşenin componentIndex/allocationType/maturityBasis
  // alanları burada elle tekrarlanır (Expense'in kendi performMaterializePayable'ı
  // ile birebir aynı, dueDate zaten elde olduğu için ayrıca bir terim
  // parse/materialize adımına gerek yoktur).
  const line = await createObligationScheduleLine(
    {
      organizationId: input.organizationId,
      direction: "PAYABLE",
      sourceType: "PURCHASE_INVOICE",
      sourceId: purchaseInvoice.id,
      componentIndex: 0,
      allocationType: "REMAINDER",
      maturityBasis: purchaseInvoice.dueDate ? "FIXED_DATE" : "IMMEDIATE",
      referenceDateType: null,
      dueDate: purchaseInvoice.dueDate ?? purchaseInvoice.updatedAt,
      originalAmount: Number(purchaseInvoice.totalAmount),
      currency: purchaseInvoice.currency,
      purchaseInvoiceId: purchaseInvoice.id,
      actorId: input.actorId,
    },
    tx,
  );

  return { line, purchaseInvoice, replayed: false };
}

function parseTermOrThrow(raw: unknown): StructuredPaymentTerm {
  try {
    return parseStructuredPaymentTerm(raw);
  } catch (error) {
    throw toApiValidationError(error);
  }
}

function toApiValidationError(error: unknown): ApiValidationError {
  if (error instanceof PaymentTermValidationError) return new ApiValidationError(error.message, 422);
  if (error instanceof ApiValidationError) return error;
  throw error;
}

export type { Expense, ObligationScheduleLine, Payment };
