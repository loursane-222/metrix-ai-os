import type { Expense, ExpenseSettlement, FinancialAccountMovement } from "@prisma/client";

import { ApiValidationError } from "@/lib/api/validation";
import { isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { recordExpenseSettlementApplication, reverseSourceEntries } from "@/lib/accounting/ledger.service";
import { sumNetReconciliationsForExpense } from "@/lib/core/employee-advances/employee-advance.repository";
import { findExpenseByIdForOrganization, applyExpenseSettlementAmount, ExpenseConcurrentlyModifiedError } from "./expense-repository";
import {
  FinancialAccountValidationError,
  assertMethodAccountCompatibility,
  assertTransactionCurrencyMatchesAccount,
  listFinancialAccounts,
  resolveFinancialAccount,
} from "@/lib/financial-accounts";

import { AMOUNT_EPSILON, assertPositiveAmount, assertSupportedSettlementMethod, computeExpenseSettlementRequestHash } from "./expense-settlement.contract";
import {
  createExpenseSettlement,
  createExpenseSettlementMovement,
  findExpenseSettlementByIdempotencyKey,
  findExpenseSettlementByReversalOfId,
  findExpenseSettlementForReversal,
  sumNetExpenseSettlements,
} from "./expense-settlement.repository";
import type { ReverseExpenseSettlementInput, ReverseExpenseSettlementOutcome, SettleExpenseInput, SettleExpenseOutcome } from "./expense-settlement.types";

/**
 * Concurrent-modification retry bütçesi — settlement.service.ts ile aynı
 * sabit/aynı gerekçe: aynı Expense'e çok kısa aralıklarla gelen gerçek
 * eşzamanlı ödeme denemeleri taze bir okuma ile bu kadar tekrar edilir.
 */
const MAX_CONCURRENT_SETTLE_ATTEMPTS = 5;

/**
 * expense.settle'ın tek canonical yazma yolu — settlement.service.ts'in
 * (Phase 3) payable aynası, final concurrency review'dan sonra AYNI üç
 * garantiyle: (1) DB-backed idempotency replay (aynı idempotencyKey + aynı
 * canonical istek → tek ExpenseSettlement, ikinci çağrı replay döner), (2)
 * Expense.amount ceiling'i concurrent-modification CAS + bounded retry ile
 * korunur (check-then-create race'e kapalı), (3) reversal kendi P2002'sini
 * yakalayıp replay eder (bkz. reverseExpenseSettlement).
 */
// outerTx (Phase 10): bkz. settlement.service.ts::applySettlement'ın aynı
// dokümantasyonu — clearInstrument kendi transaction'ına compose eder,
// verildiğinde retry loop atlanır.
export async function settleExpense(input: SettleExpenseInput, outerTx?: PrismaTransactionClient): Promise<SettleExpenseOutcome | null> {
  assertPositiveAmount(input.amount);
  assertSupportedSettlementMethod(input.paymentMethod);

  const occurredAt = input.occurredAt ?? new Date();

  if (input.idempotencyKey) {
    const existing = await findExpenseSettlementByIdempotencyKey(input.organizationId, input.expenseId, input.idempotencyKey);
    if (existing) return replayExistingExpenseSettlement(existing, input);
  }

  if (outerTx) {
    return performSettle(outerTx, input, occurredAt);
  }

  for (let attempt = 1; attempt <= MAX_CONCURRENT_SETTLE_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction((tx) => performSettle(tx, input, occurredAt));
    } catch (error) {
      if (input.idempotencyKey && isIdempotencyKeyCollision(error)) {
        const existing = await findExpenseSettlementByIdempotencyKey(input.organizationId, input.expenseId, input.idempotencyKey);
        if (existing) return replayExistingExpenseSettlement(existing, input);
      }
      if (error instanceof ExpenseConcurrentlyModifiedError) {
        if (attempt === MAX_CONCURRENT_SETTLE_ATTEMPTS) {
          throw new ApiValidationError("could not settle expense due to concurrent updates to this expense; please retry.", 409);
        }
        continue;
      }
      throw error;
    }
  }
  throw new ApiValidationError("could not settle expense due to concurrent updates to this expense; please retry.", 409);
}

async function performSettle(tx: PrismaTransactionClient, input: SettleExpenseInput, occurredAt: Date): Promise<SettleExpenseOutcome | null> {
  // Phase 11: employee-advance reconciliation da AYNI Expense satırını
  // (aynı satır, farklı bir tablo üzerinden) kilitler — bu lock olmadan bir
  // eşzamanlı reconcileEmployeeAdvance ile bu fonksiyon birbirinin
  // ceiling'ini görmeden ikisi de "geçer" ve aynı gideri iki kez kapatabilir.
  // Tek kaynak (Expense) kilitlendiği için reconcileEmployeeAdvance'in
  // advance→expense sırasıyla çakışıp deadlock üretme riski yoktur.
  await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${input.expenseId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;
  const expense = await findExpenseByIdForOrganization(input.expenseId, input.organizationId, tx);
  if (!expense) return null;

  if (expense.status === "CANCELLED") {
    throw new ApiValidationError("a cancelled expense cannot be settled.", 409);
  }
  // Phase 11: bir corporate-card gideri doğrudan expense.settle ile
  // ödenemez — gerçek nakit çıkışı yalnız statement.payment üzerinden
  // (CardStatementPayment) olur. Aksi halde aynı kart harcaması hem
  // expense.settle hem statement ödemesiyle iki kez nakit çıkışı üretebilir.
  if (expense.corporateCardId) {
    throw new ApiValidationError("a corporate-card expense cannot be settled directly; pay its card statement instead.", 409);
  }

  const currentPaid = Number(expense.paidAmount);
  const alreadyReconciledViaAdvance = await sumNetReconciliationsForExpense(input.organizationId, expense.id, tx);
  const total = Number(expense.amount);
  const remaining = total - currentPaid - alreadyReconciledViaAdvance;
  if (input.amount > remaining + AMOUNT_EPSILON) {
    throw new ApiValidationError("amount exceeds the remaining expense balance (real cash paid + already-reconciled employee advances considered).", 409);
  }

  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, expense.currency);
  assertCompatibility(input.paymentMethod, account, expense.currency);

  const requestHash = input.idempotencyKey
    ? computeExpenseSettlementRequestHash({ expenseId: input.expenseId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt })
    : null;

  const settlement = await createExpenseSettlement(
    {
      organizationId: input.organizationId,
      expenseId: input.expenseId,
      kind: "ORIGINAL",
      amount: input.amount,
      currency: expense.currency,
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

  const movement = await createExpenseSettlementMovement(
    {
      organizationId: input.organizationId,
      financialAccountId: account.id,
      expenseSettlementId: settlement.id,
      paymentMethod: input.paymentMethod,
      amount: input.amount,
      currency: expense.currency,
      occurredAt,
      direction: "OUT",
      provenance: { source: "expense.settle", actorId: input.actorId },
    },
    tx,
  );

  const newPaidAmount = Math.min(currentPaid + input.amount, total);
  // isFullyPaid: yalnız nakit değil, nakit + zaten avansla mahsup edilmiş
  // kısım birlikte total'ı kapatıyorsa — paidAmount kendisi hâlâ SADECE
  // nakit tutar olarak kalır (ExpenseSettlement toplamının cache'i), yalnız
  // status "bu gider artık tamamen karşılandı mı" sorusuna doğru cevap verir.
  const isFullyPaid = total - newPaidAmount - alreadyReconciledViaAdvance <= AMOUNT_EPSILON;
  const updatedExpense = await applyExpenseSettlementAmount(
    { id: input.expenseId, organizationId: input.organizationId, paidAmount: newPaidAmount, status: isFullyPaid ? "PAID" : "PARTIALLY_PAID", expectedPriorPaidAmount: currentPaid },
    tx,
  );
  if (!updatedExpense) return null;

  await recordExpenseSettlementApplication({ tx, organizationId: input.organizationId, expenseSettlementId: settlement.id, entryDate: occurredAt, amount: input.amount, currency: expense.currency });

  return { expense: updatedExpense, settlement, movement, replayed: false };
}

async function replayExistingExpenseSettlement(existing: ExpenseSettlement, input: SettleExpenseInput): Promise<SettleExpenseOutcome> {
  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, existing.currency);
  const requestHash = computeExpenseSettlementRequestHash({ expenseId: input.expenseId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt });
  if (existing.requestHash !== requestHash) {
    throw new ApiValidationError("Idempotency-Key was already used with a different request.", 409);
  }

  const [expense, movement] = await Promise.all([
    findExpenseByIdForOrganization(input.expenseId, input.organizationId),
    prisma.financialAccountMovement.findFirst({ where: { organizationId: input.organizationId, expenseSettlementId: existing.id } }),
  ]);
  if (!expense || !movement) {
    throw new ApiValidationError("Idempotency key conflict detected but the original record could not be found.", 500);
  }
  return { expense, settlement: existing, movement, replayed: true };
}

/**
 * Bir ExpenseSettlement'ı canonical olarak geri alır — reverseSettlement
 * (settlement.service.ts) ile aynı desen: yeni REVERSAL satır +
 * reversalOfId zinciri, Expense.paidAmount SUM(ORIGINAL)-SUM(REVERSAL)
 * üzerinden yeniden hesaplanır, ledger reverseSourceEntries ile ters
 * kayıt alır. Orijinal satır asla silinmez/mutate edilmez.
 *
 * Replay-safe: original.reversal kontrolü sıralı çağrılarda ikinci
 * ekonomik reversal'ı zaten engeller, ama bunu gerçek bir eşzamanlılıkla
 * (iki paralel reverse çağrısı, ikisi de reversal:null görür) DB seviyesinde
 * garanti eden ExpenseSettlement.reversalOfId'nin @unique olmasıdır — ikinci
 * INSERT P2002 ile çakışır. Bu çakışma burada yakalanıp var olan reversal
 * replay edilir (raw 500 sızdırmak yerine).
 */
export async function reverseExpenseSettlement(input: ReverseExpenseSettlementInput): Promise<ReverseExpenseSettlementOutcome | null> {
  if (!input.reason?.trim()) throw new ApiValidationError("reason is required to reverse an expense settlement.", 400);

  try {
    return await prisma.$transaction((tx) => performReverse(tx, input));
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) {
      const existing = await findExpenseSettlementByReversalOfId(input.organizationId, input.expenseSettlementId);
      if (existing) {
        const expense = await findExpenseByIdForOrganization(existing.expenseId, input.organizationId);
        if (expense && existing.movement) return { expense, settlement: existing, movement: existing.movement };
      }
    }
    throw error;
  }
}

async function performReverse(tx: PrismaTransactionClient, input: ReverseExpenseSettlementInput): Promise<ReverseExpenseSettlementOutcome | null> {
    const original = await findExpenseSettlementForReversal(input.organizationId, input.expenseSettlementId, tx);
    if (!original) return null;
    if (original.kind === "REVERSAL") throw new ApiValidationError("a reversal cannot itself be reversed.", 409);
    if (original.reversal) throw new ApiValidationError("this expense settlement has already been reversed.", 409);
    if (!original.movement) throw new ApiValidationError("expense settlement is missing its movement record.", 500);

    const occurredAt = input.occurredAt ?? new Date();
    const amount = Number(original.amount);

    const reversalSettlement = await createExpenseSettlement(
      {
        organizationId: input.organizationId,
        expenseId: original.expenseId,
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

    const reversalMovement = await createExpenseSettlementMovement(
      {
        organizationId: input.organizationId,
        financialAccountId: original.financialAccountId,
        expenseSettlementId: reversalSettlement.id,
        paymentMethod: original.paymentMethod,
        amount,
        currency: original.currency,
        occurredAt,
        direction: "IN",
        provenance: { source: "expense.settlement.reverse", actorId: input.actorId, reversalOf: original.id },
        reversalOfId: original.movement.id,
      },
      tx,
    );

    const netApplied = await sumNetExpenseSettlements(input.organizationId, original.expenseId, tx);
    const expense = await findExpenseByIdForOrganization(original.expenseId, input.organizationId, tx);
    if (!expense) throw new ApiValidationError("Expense not found.", 404);
    const total = Number(expense.amount);
    const isFullyPaid = total - netApplied <= AMOUNT_EPSILON;
    const updatedExpense = await applyExpenseSettlementAmount(
      { id: original.expenseId, organizationId: input.organizationId, paidAmount: Math.max(netApplied, 0), status: netApplied <= AMOUNT_EPSILON ? "PENDING" : isFullyPaid ? "PAID" : "PARTIALLY_PAID" },
      tx,
    );
    if (!updatedExpense) throw new ApiValidationError("Expense not found.", 404);

    await reverseSourceEntries({ tx, organizationId: input.organizationId, sourceType: "EXPENSE_SETTLEMENT", sourceId: original.id, entryDate: occurredAt });

    return { expense: updatedExpense, settlement: reversalSettlement, movement: reversalMovement };
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

export type { Expense, ExpenseSettlement, FinancialAccountMovement };
