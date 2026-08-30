import type { FinancialAccountMovement, PurchaseInvoice, SupplierPayment } from "@prisma/client";

import { ApiValidationError } from "@/lib/api/validation";
import { isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { recordSupplierPaymentApplication, reverseSourceEntries } from "@/lib/accounting/ledger.service";
import { findPurchaseInvoiceById, applySupplierPaymentAmount, SupplierPaymentConcurrentlyModifiedError } from "@/lib/core/purchase-invoices/purchase-invoice.repository";
import {
  FinancialAccountValidationError,
  assertMethodAccountCompatibility,
  assertTransactionCurrencyMatchesAccount,
  listFinancialAccounts,
  resolveFinancialAccount,
} from "@/lib/financial-accounts";

import { AMOUNT_EPSILON, assertPositiveAmount, assertSupportedSettlementMethod, computeSupplierPaymentRequestHash } from "./supplier-payment.contract";
import {
  createSupplierPayment,
  createSupplierPaymentMovement,
  findSupplierPaymentByIdempotencyKey,
  findSupplierPaymentByReversalOfId,
  findSupplierPaymentForReversal,
  sumNetSupplierPayments,
} from "./supplier-payment.repository";
import type { ApplySupplierPaymentInput, ApplySupplierPaymentOutcome, ReverseSupplierPaymentInput, ReverseSupplierPaymentOutcome } from "./supplier-payment.types";

/**
 * Concurrent-modification retry bütçesi — settlement.service.ts /
 * expense-settlement.service.ts ile aynı sabit/gerekçe.
 */
const MAX_CONCURRENT_APPLY_ATTEMPTS = 5;

/**
 * supplierPayment.apply'ın tek canonical yazma yolu — settlement.service.ts
 * (sales) ve expense-settlement.service.ts (Expense payable) ile AYNI üç
 * garanti: (1) DB-backed idempotency replay, (2) PurchaseInvoice.totalAmount
 * ceiling'i concurrent-modification CAS + bounded retry ile korunur, (3)
 * reversal kendi P2002'sini yakalayıp replay eder. Purchase Invoice ≠
 * Expense invariant'ı gereği kendi tablosu (SupplierPayment), ama AYNI
 * kanıtlanmış mimari — parallel bir money-movement authority değil.
 */
export async function applySupplierPayment(input: ApplySupplierPaymentInput): Promise<ApplySupplierPaymentOutcome | null> {
  assertPositiveAmount(input.amount);
  assertSupportedSettlementMethod(input.paymentMethod);

  const occurredAt = input.occurredAt ?? new Date();

  if (input.idempotencyKey) {
    const existing = await findSupplierPaymentByIdempotencyKey(input.organizationId, input.purchaseInvoiceId, input.idempotencyKey);
    if (existing) return replayExistingSupplierPayment(existing, input);
  }

  for (let attempt = 1; attempt <= MAX_CONCURRENT_APPLY_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction((tx) => performApply(tx, input, occurredAt));
    } catch (error) {
      if (input.idempotencyKey && isIdempotencyKeyCollision(error)) {
        const existing = await findSupplierPaymentByIdempotencyKey(input.organizationId, input.purchaseInvoiceId, input.idempotencyKey);
        if (existing) return replayExistingSupplierPayment(existing, input);
      }
      if (error instanceof SupplierPaymentConcurrentlyModifiedError) {
        if (attempt === MAX_CONCURRENT_APPLY_ATTEMPTS) {
          throw new ApiValidationError("could not apply supplier payment due to concurrent updates to this purchase invoice; please retry.", 409);
        }
        continue;
      }
      throw error;
    }
  }
  throw new ApiValidationError("could not apply supplier payment due to concurrent updates to this purchase invoice; please retry.", 409);
}

async function performApply(tx: PrismaTransactionClient, input: ApplySupplierPaymentInput, occurredAt: Date): Promise<ApplySupplierPaymentOutcome | null> {
  const purchaseInvoice = await findPurchaseInvoiceById(input.purchaseInvoiceId, input.organizationId, tx);
  if (!purchaseInvoice) return null;

  if (purchaseInvoice.status === "DRAFT") {
    throw new ApiValidationError("a draft purchase invoice has no confirmed payable to settle yet.", 409);
  }
  if (purchaseInvoice.status === "PAID" || purchaseInvoice.status === "CANCELLED") {
    throw new ApiValidationError(`PurchaseInvoice is already ${purchaseInvoice.status}.`, 409);
  }

  const currentPaid = Number(purchaseInvoice.paidAmount);
  const total = Number(purchaseInvoice.totalAmount);
  const remaining = total - currentPaid;
  if (input.amount > remaining + AMOUNT_EPSILON) {
    throw new ApiValidationError("amount exceeds the remaining purchase invoice balance.", 409);
  }

  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, purchaseInvoice.currency);
  assertCompatibility(input.paymentMethod, account, purchaseInvoice.currency);

  const requestHash = input.idempotencyKey
    ? computeSupplierPaymentRequestHash({ purchaseInvoiceId: input.purchaseInvoiceId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt })
    : null;

  const settlement = await createSupplierPayment(
    {
      organizationId: input.organizationId,
      purchaseInvoiceId: input.purchaseInvoiceId,
      kind: "ORIGINAL",
      amount: input.amount,
      currency: purchaseInvoice.currency,
      paymentMethod: input.paymentMethod,
      financialAccountId: account.id,
      occurredAt,
      idempotencyKey: input.idempotencyKey ?? null,
      requestHash,
      reason: null,
      actorId: input.actorId,
    },
    tx,
  );

  const movement = await createSupplierPaymentMovement(
    {
      organizationId: input.organizationId,
      financialAccountId: account.id,
      supplierPaymentId: settlement.id,
      paymentMethod: input.paymentMethod,
      amount: input.amount,
      currency: purchaseInvoice.currency,
      occurredAt,
      direction: "OUT",
      provenance: { source: "supplierPayment.apply", actorId: input.actorId },
    },
    tx,
  );

  const newPaidAmount = Math.min(currentPaid + input.amount, total);
  const isFullyPaid = total - newPaidAmount <= AMOUNT_EPSILON;
  const updatedPurchaseInvoice = await applySupplierPaymentAmount(
    { id: input.purchaseInvoiceId, organizationId: input.organizationId, paidAmount: newPaidAmount, status: isFullyPaid ? "PAID" : "CONFIRMED", expectedPriorPaidAmount: currentPaid },
    tx,
  );
  if (!updatedPurchaseInvoice) return null;

  await recordSupplierPaymentApplication({ tx, organizationId: input.organizationId, supplierPaymentId: settlement.id, entryDate: occurredAt, amount: input.amount, currency: purchaseInvoice.currency });

  return { purchaseInvoice: updatedPurchaseInvoice, settlement, movement, replayed: false };
}

async function replayExistingSupplierPayment(existing: SupplierPayment, input: ApplySupplierPaymentInput): Promise<ApplySupplierPaymentOutcome> {
  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, existing.currency);
  const requestHash = computeSupplierPaymentRequestHash({ purchaseInvoiceId: input.purchaseInvoiceId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt });
  if (existing.requestHash !== requestHash) {
    throw new ApiValidationError("Idempotency-Key was already used with a different request.", 409);
  }

  const [purchaseInvoice, movement] = await Promise.all([
    findPurchaseInvoiceById(input.purchaseInvoiceId, input.organizationId),
    prisma.financialAccountMovement.findFirst({ where: { organizationId: input.organizationId, supplierPaymentId: existing.id } }),
  ]);
  if (!purchaseInvoice || !movement) {
    throw new ApiValidationError("Idempotency key conflict detected but the original record could not be found.", 500);
  }
  return { purchaseInvoice, settlement: existing, movement, replayed: true };
}

/**
 * Bir SupplierPayment'ı canonical olarak geri alır — reverseSettlement /
 * reverseExpenseSettlement ile aynı desen: yeni REVERSAL satır + reversalOfId
 * zinciri, PurchaseInvoice.paidAmount SUM(ORIGINAL)-SUM(REVERSAL) üzerinden
 * yeniden hesaplanır. Orijinal satır asla silinmez/mutate edilmez.
 */
export async function reverseSupplierPayment(input: ReverseSupplierPaymentInput): Promise<ReverseSupplierPaymentOutcome | null> {
  if (!input.reason?.trim()) throw new ApiValidationError("reason is required to reverse a supplier payment.", 400);

  try {
    return await prisma.$transaction((tx) => performReverse(tx, input));
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) {
      const existing = await findSupplierPaymentByReversalOfId(input.organizationId, input.supplierPaymentId);
      if (existing) {
        const purchaseInvoice = await findPurchaseInvoiceById(existing.purchaseInvoiceId, input.organizationId);
        if (purchaseInvoice && existing.movement) return { purchaseInvoice, settlement: existing, movement: existing.movement };
      }
    }
    throw error;
  }
}

async function performReverse(tx: PrismaTransactionClient, input: ReverseSupplierPaymentInput): Promise<ReverseSupplierPaymentOutcome | null> {
  const original = await findSupplierPaymentForReversal(input.organizationId, input.supplierPaymentId, tx);
  if (!original) return null;
  if (original.kind === "REVERSAL") throw new ApiValidationError("a reversal cannot itself be reversed.", 409);
  if (original.reversal) throw new ApiValidationError("this supplier payment has already been reversed.", 409);
  if (!original.movement) throw new ApiValidationError("supplier payment is missing its movement record.", 500);

  const occurredAt = input.occurredAt ?? new Date();
  const amount = Number(original.amount);

  const reversalSettlement = await createSupplierPayment(
    {
      organizationId: input.organizationId,
      purchaseInvoiceId: original.purchaseInvoiceId,
      kind: "REVERSAL",
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

  const reversalMovement = await createSupplierPaymentMovement(
    {
      organizationId: input.organizationId,
      financialAccountId: original.financialAccountId,
      supplierPaymentId: reversalSettlement.id,
      paymentMethod: original.paymentMethod,
      amount,
      currency: original.currency,
      occurredAt,
      direction: "IN",
      provenance: { source: "supplierPayment.reverse", actorId: input.actorId, reversalOf: original.id },
      reversalOfId: original.movement.id,
    },
    tx,
  );

  const netApplied = await sumNetSupplierPayments(input.organizationId, original.purchaseInvoiceId, tx);
  const purchaseInvoice = await findPurchaseInvoiceById(original.purchaseInvoiceId, input.organizationId, tx);
  if (!purchaseInvoice) throw new ApiValidationError("PurchaseInvoice not found.", 404);
  const total = Number(purchaseInvoice.totalAmount);
  const isFullyPaid = total - netApplied <= AMOUNT_EPSILON;
  const updatedPurchaseInvoice = await applySupplierPaymentAmount(
    { id: original.purchaseInvoiceId, organizationId: input.organizationId, paidAmount: Math.max(netApplied, 0), status: isFullyPaid ? "PAID" : "CONFIRMED" },
    tx,
  );
  if (!updatedPurchaseInvoice) throw new ApiValidationError("PurchaseInvoice not found.", 404);

  await reverseSourceEntries({ tx, organizationId: input.organizationId, sourceType: "SUPPLIER_PAYMENT", sourceId: original.id, entryDate: occurredAt });

  return { purchaseInvoice: updatedPurchaseInvoice, settlement: reversalSettlement, movement: reversalMovement };
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

export type { PurchaseInvoice, SupplierPayment, FinancialAccountMovement };
