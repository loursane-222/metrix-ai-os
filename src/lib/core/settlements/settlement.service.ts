import type { Application, FinancialAccountMovement, Payment, Settlement } from "@prisma/client";

import { ApiValidationError } from "@/lib/api/validation";
import { isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { findInvoiceById } from "@/lib/core/invoices/invoice.repository";
import { findPaymentByIdForOrganization, applyPaymentAmount as applyPaymentAmountRepository, PaymentConcurrentlyModifiedError } from "@/lib/core/payments/payment.repository";
import { recordPaymentApplication, reverseSourceEntries } from "@/lib/accounting/ledger.service";
import {
  FinancialAccountValidationError,
  assertMethodAccountCompatibility,
  assertTransactionCurrencyMatchesAccount,
  listFinancialAccounts,
  resolveFinancialAccount,
} from "@/lib/financial-accounts";

import { AMOUNT_EPSILON, assertApplicationWithinSettlement, assertPositiveAmount, assertSupportedSettlementMethod, computeSettlementRequestHash } from "./settlement.contract";
import { createApplication, createMovement, createSettlement, findSettlementByIdempotencyKey, findSettlementForReversal, sumNetApplications } from "./settlement.repository";
import type { ApplySettlementInput, ApplySettlementOutcome, ReverseSettlementInput, ReverseSettlementOutcome } from "./settlement.types";

/**
 * Concurrent-modification retry bütçesi. Aynı Payment'a çok kısa aralıklarla
 * gelen, farklı idempotencyKey'li (ya da hiç key'siz) gerçek eşzamanlı
 * tahsilat denemeleri bu kadar denemeye kadar taze bir okuma ile tekrar
 * edilir; her deneme kendi Settlement/Application/Movement'ını üretir, aksi
 * biten denemenin satırları transaction rollback ile tamamen silinir.
 */
const MAX_CONCURRENT_APPLY_ATTEMPTS = 5;

/**
 * payment.apply'ın tek canonical yazma yolu. Kalan bakiye/over-application
 * guard'ı Phase 2 öncesi applyPaymentAmount ile aynıdır; ek olarak method+
 * financial account resolve/compatibility/currency kontrolleri ve immutable
 * Settlement+Application+FinancialAccountMovement üçlüsü burada eklenir.
 * Idempotency: caller bir idempotencyKey verdiyse önce mevcut Settlement
 * aranır (replay); DB unique constraint yarış durumunda ikinci bir güvenlik
 * ağı olarak devrededir.
 */
/**
 * outerTx (Phase 10): clearInstrument (financial-instrument.service.ts)
 * composes this into its own transaction — an instrument-clearing operation
 * must be atomic with the instrument's own status transition, and Prisma
 * cannot nest a second top-level $transaction inside an active one. When
 * outerTx is given, the retry-on-concurrent-modification loop is skipped
 * (there is no fresh transaction to retry into) — a concurrency conflict
 * propagates uncaught, rolling back the whole outer operation (including
 * the instrument's own status change), which is correct: the caller
 * re-invokes clearInstrument from scratch rather than this function
 * silently retrying mid-way through someone else's transaction. Every
 * existing caller omits outerTx and keeps today's exact behavior.
 */
export async function applySettlement(input: ApplySettlementInput, outerTx?: PrismaTransactionClient): Promise<ApplySettlementOutcome | null> {
  assertPositiveAmount(input.amount);
  assertSupportedSettlementMethod(input.paymentMethod);

  const occurredAt = input.occurredAt ?? new Date();

  if (input.idempotencyKey) {
    const existing = await findSettlementByIdempotencyKey(input.organizationId, input.paymentId, input.idempotencyKey);
    if (existing) return replayExistingSettlement(existing, input);
  }

  if (outerTx) {
    return performApply(outerTx, input, occurredAt);
  }

  for (let attempt = 1; attempt <= MAX_CONCURRENT_APPLY_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction((tx) => performApply(tx, input, occurredAt));
    } catch (error) {
      if (input.idempotencyKey && isIdempotencyKeyCollision(error)) {
        const existing = await findSettlementByIdempotencyKey(input.organizationId, input.paymentId, input.idempotencyKey);
        if (existing) return replayExistingSettlement(existing, input);
      }
      if (error instanceof PaymentConcurrentlyModifiedError) {
        if (attempt === MAX_CONCURRENT_APPLY_ATTEMPTS) {
          throw new ApiValidationError("could not apply settlement due to concurrent updates to this payment; please retry.", 409);
        }
        continue;
      }
      throw error;
    }
  }
  throw new ApiValidationError("could not apply settlement due to concurrent updates to this payment; please retry.", 409);
}

async function performApply(tx: PrismaTransactionClient, input: ApplySettlementInput, occurredAt: Date): Promise<ApplySettlementOutcome | null> {
  const payment = await findPaymentByIdForOrganization(input.paymentId, input.organizationId, tx);
  if (!payment) return null;

  if (payment.status === "PAID" || payment.status === "CANCELLED") {
    throw new ApiValidationError(`Payment is already ${payment.status}.`, 409);
  }

  const currentPaid = Number(payment.paidAmount);
  const total = Number(payment.amount);
  const remaining = total - currentPaid;
  if (input.amount > remaining + AMOUNT_EPSILON) {
    throw new ApiValidationError("amount exceeds the remaining payment balance.", 409);
  }

  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, payment.currency);
  assertCompatibility(input.paymentMethod, account, payment.currency);

  const requestHash = input.idempotencyKey
    ? computeSettlementRequestHash({ paymentId: input.paymentId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt })
    : null;

  const settlement = await createSettlement(
    {
      organizationId: input.organizationId,
      paymentId: input.paymentId,
      kind: "ORIGINAL",
      direction: "IN",
      amount: input.amount,
      currency: payment.currency,
      paymentMethod: input.paymentMethod,
      financialAccountId: account.id,
      occurredAt,
      idempotencyKey: input.idempotencyKey ?? null,
      requestHash,
      reason: null,
      referenceNumber: input.referenceNumber ?? null,
      externalReference: input.externalReference ?? null,
      actorId: input.actorId,
    },
    tx,
  );

  assertApplicationWithinSettlement(input.amount, Number(settlement.amount));
  const application = await createApplication(
    { organizationId: input.organizationId, settlementId: settlement.id, paymentId: input.paymentId, kind: "ORIGINAL", amount: input.amount, currency: payment.currency, appliedAt: occurredAt },
    tx,
  );

  const movement = await createMovement(
    {
      organizationId: input.organizationId,
      financialAccountId: account.id,
      settlementId: settlement.id,
      paymentMethod: input.paymentMethod,
      amount: input.amount,
      currency: payment.currency,
      occurredAt,
      direction: "IN",
      provenance: { source: "payment.apply", actorId: input.actorId, applicationId: application.id },
    },
    tx,
  );

  const newPaidAmount = Math.min(currentPaid + input.amount, total);
  const isFullyPaid = total - newPaidAmount <= AMOUNT_EPSILON;
  const paidAt = isFullyPaid ? occurredAt : null;
  const updatedPayment = await applyPaymentAmountRepository(
    { id: input.paymentId, organizationId: input.organizationId, paidAmount: newPaidAmount, status: isFullyPaid ? "PAID" : "PARTIAL", paidAt, expectedPriorPaidAmount: currentPaid },
    tx,
  );
  if (!updatedPayment) return null;

  await recordPaymentApplication({ tx, organizationId: input.organizationId, applicationId: application.id, entryDate: occurredAt, amount: input.amount, currency: payment.currency });

  if (updatedPayment.invoiceId) {
    await syncInvoiceStatusForPayment(tx, input.organizationId, updatedPayment.invoiceId);
  }

  return { payment: updatedPayment, settlement, application, movement, replayed: false };
}

async function replayExistingSettlement(existing: Settlement, input: ApplySettlementInput): Promise<ApplySettlementOutcome> {
  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, existing.currency);
  const requestHash = computeSettlementRequestHash({ paymentId: input.paymentId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt });
  if (existing.requestHash !== requestHash) {
    throw new ApiValidationError("Idempotency-Key was already used with a different request.", 409);
  }

  const [payment, application, movement] = await Promise.all([
    findPaymentByIdForOrganization(input.paymentId, input.organizationId),
    prisma.application.findFirst({ where: { organizationId: input.organizationId, settlementId: existing.id } }),
    prisma.financialAccountMovement.findFirst({ where: { organizationId: input.organizationId, settlementId: existing.id } }),
  ]);
  if (!payment || !application || !movement) {
    throw new ApiValidationError("Idempotency key conflict detected but the original record could not be found.", 500);
  }
  return { payment, settlement: existing, application, movement, replayed: true };
}

/**
 * Bir Settlement'ı canonical olarak geri alır: yeni REVERSAL Settlement/
 * Application/FinancialAccountMovement satırları üretir (orijinal asla
 * silinmez/mutate edilmez), Payment.paidAmount'ı SUM(ORIGINAL)-SUM(REVERSAL)
 * üzerinden yeniden hesaplar, ledger'da mevcut reverseSourceEntries'i
 * PAYMENT_APPLICATION/applicationId üzerinden çağırır, ve invoice'u gerekirse
 * PAID'den SENT'e geri alır.
 */
export async function reverseSettlement(input: ReverseSettlementInput): Promise<ReverseSettlementOutcome | null> {
  if (!input.reason?.trim()) throw new ApiValidationError("reason is required to reverse a settlement.", 400);

  return prisma.$transaction(async (tx) => {
    const original = await findSettlementForReversal(input.organizationId, input.settlementId, tx);
    if (!original) return null;
    if (original.kind === "REVERSAL") throw new ApiValidationError("a reversal cannot itself be reversed.", 409);
    if (original.reversal) throw new ApiValidationError("this settlement has already been reversed.", 409);

    const originalApplication = original.applications.find((application) => application.kind === "ORIGINAL");
    const originalMovement = original.movements.find((movement) => movement.direction === "IN");
    if (!originalApplication || !originalMovement) {
      throw new ApiValidationError("settlement is missing its application or movement record.", 500);
    }

    const occurredAt = input.occurredAt ?? new Date();
    const amount = Number(original.amount);

    const reversalSettlement = await createSettlement(
      {
        organizationId: input.organizationId,
        paymentId: original.paymentId,
        kind: "REVERSAL",
        direction: "OUT",
        amount,
        currency: original.currency,
        paymentMethod: original.paymentMethod,
        financialAccountId: original.financialAccountId,
        occurredAt,
        idempotencyKey: null,
        requestHash: null,
        reason: input.reason.trim(),
        actorId: input.actorId,
        reversalOfId: original.id,
      },
      tx,
    );

    assertApplicationWithinSettlement(amount, Number(reversalSettlement.amount));
    const reversalApplication = await createApplication(
      { organizationId: input.organizationId, settlementId: reversalSettlement.id, paymentId: original.paymentId, kind: "REVERSAL", amount, currency: original.currency, appliedAt: occurredAt, reversalOfId: originalApplication.id },
      tx,
    );

    const reversalMovement = await createMovement(
      {
        organizationId: input.organizationId,
        financialAccountId: original.financialAccountId,
        settlementId: reversalSettlement.id,
        paymentMethod: original.paymentMethod,
        amount,
        currency: original.currency,
        occurredAt,
        direction: "OUT",
        provenance: { source: "settlement.reverse", actorId: input.actorId, applicationId: reversalApplication.id, reversalOf: original.id },
        reversalOfId: originalMovement.id,
      },
      tx,
    );

    const netApplied = await sumNetApplications(input.organizationId, original.paymentId, tx);
    const payment = await findPaymentByIdForOrganization(original.paymentId, input.organizationId, tx);
    if (!payment) throw new ApiValidationError("Payment not found.", 404);
    const total = Number(payment.amount);
    const isFullyPaid = total - netApplied <= AMOUNT_EPSILON;
    const updatedPayment = await applyPaymentAmountRepository(
      { id: original.paymentId, organizationId: input.organizationId, paidAmount: Math.max(netApplied, 0), status: netApplied <= AMOUNT_EPSILON ? "PENDING" : isFullyPaid ? "PAID" : "PARTIAL", paidAt: isFullyPaid ? payment.paidAt : null },
      tx,
    );
    if (!updatedPayment) throw new ApiValidationError("Payment not found.", 404);

    await reverseSourceEntries({ tx, organizationId: input.organizationId, sourceType: "PAYMENT_APPLICATION", sourceId: originalApplication.id, entryDate: occurredAt });

    if (updatedPayment.invoiceId) {
      await syncInvoiceStatusForPayment(tx, input.organizationId, updatedPayment.invoiceId);
    }

    return { payment: updatedPayment, settlement: reversalSettlement, application: reversalApplication, movement: reversalMovement };
  });
}

async function resolveAccountOrThrow(organizationId: string, reference: string, transactionCurrency: string) {
  const accounts = await listFinancialAccounts(organizationId);
  const resolution = resolveFinancialAccount(accounts, organizationId, reference);
  if (resolution.kind === "NOT_FOUND") throw new ApiValidationError("financial account not found.", 404);
  if (resolution.kind === "AMBIGUOUS") throw new ApiValidationError("financial account reference is ambiguous; be more specific.", 409);
  if (resolution.kind === "INACTIVE") throw new ApiValidationError("financial account is inactive.", 409);
  try {
    assertTransactionCurrencyMatchesAccount(transactionCurrency, resolution.account);
  } catch (error) {
    throw toApiValidationError(error);
  }
  return resolution.account;
}

function assertCompatibility(method: Parameters<typeof assertMethodAccountCompatibility>[0], account: Parameters<typeof assertMethodAccountCompatibility>[1], currency: string): void {
  try {
    assertMethodAccountCompatibility(method, account);
    assertTransactionCurrencyMatchesAccount(currency, account);
  } catch (error) {
    throw toApiValidationError(error);
  }
}

function toApiValidationError(error: unknown): ApiValidationError {
  if (error instanceof FinancialAccountValidationError) return new ApiValidationError(error.message, 422);
  if (error instanceof ApiValidationError) return error;
  throw error;
}

/**
 * Invoice rollup şu an aggregate 120 Alıcılar hesabıyla aynı sınırlamayı
 * taşır (fatura bazlı gerçek eşleşme Phase 7/8). Bu fonksiyon simetriktir:
 * hem PAID'e geçirir (mevcut davranış) hem de bir reversal sonrası
 * gerektiğinde SENT'e geri alır (yeni davranış, Phase 3 gap fix).
 */
async function syncInvoiceStatusForPayment(tx: PrismaTransactionClient, organizationId: string, invoiceId: string): Promise<void> {
  const invoice = await findInvoiceById(invoiceId, organizationId, tx);
  if (!invoice) return;
  const paid = await tx.payment.aggregate({ where: { invoiceId }, _sum: { paidAmount: true } });
  const paidTotal = Number(paid._sum.paidAmount ?? 0);
  const isFullyPaid = paidTotal >= Number(invoice.totalAmount) - AMOUNT_EPSILON;
  if (isFullyPaid && invoice.status !== "PAID") {
    await tx.invoice.updateMany({ where: { id: invoice.id, organizationId, status: { not: "PAID" } }, data: { status: "PAID" } });
  } else if (!isFullyPaid && invoice.status === "PAID") {
    await tx.invoice.updateMany({ where: { id: invoice.id, organizationId, status: "PAID" }, data: { status: "SENT" } });
  }
}

export type { Payment, Settlement, Application, FinancialAccountMovement };
