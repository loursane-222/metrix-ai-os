import type { CardStatementPayment, FinancialAccountMovement } from "@prisma/client";

import { ApiValidationError } from "@/lib/api/validation";
import { isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { recordCardStatementPaymentApplication, reverseSourceEntries } from "@/lib/accounting/ledger.service";
import { materializeCardStatementPayableSchedule } from "@/lib/core/obligations/obligation-schedule.service";
import {
  FinancialAccountValidationError,
  assertMethodAccountCompatibility,
  assertTransactionCurrencyMatchesAccount,
  listFinancialAccounts,
  resolveFinancialAccount,
} from "@/lib/financial-accounts";

import {
  AMOUNT_EPSILON,
  assertClosableCardStatementStatus,
  assertNonEmpty,
  assertPayableCardStatementStatus,
  assertPositiveAmount,
  assertSupportedSettlementMethod,
  computeCardStatementPaymentRequestHash,
} from "./corporate-card.contract";
import {
  applyCardStatementPaymentAmount,
  assignExpensesToCardStatement,
  closeCardStatementRow,
  createCardStatement,
  createCardStatementPayment,
  createCardStatementPaymentMovement,
  createCorporateCard,
  findCardStatementById,
  findCardStatementPaymentByIdempotencyKey,
  findCardStatementPaymentByReversalOfId,
  findCardStatementPaymentForReversal,
  findCorporateCardById,
  findUnassignedCardExpensesForPeriod,
  sumNetCardStatementPayments,
  updateCorporateCardStatus as updateCorporateCardStatusRepo,
} from "./corporate-card.repository";
import type {
  CloseCardStatementInput,
  CloseCardStatementOutcome,
  CreateCorporateCardInput,
  OpenCardStatementInput,
  PayCardStatementInput,
  PayCardStatementOutcome,
  ReverseCardStatementPaymentInput,
  ReverseCardStatementPaymentOutcome,
  UpdateCorporateCardStatusInput,
} from "./corporate-card.types";

const MAX_CONCURRENT_PAY_ATTEMPTS = 5;

export async function createNewCorporateCard(input: CreateCorporateCardInput) {
  assertNonEmpty(input.label, "label");
  assertNonEmpty(input.cardholderMemberId, "cardholderMemberId");
  return prisma.$transaction((tx) => createCorporateCard(input, tx));
}

/** ACTIVE↔SUSPENDED serbest; CANCELLED tersinmez (yeniden ACTIVE olamaz). */
export async function updateCorporateCardStatus(input: UpdateCorporateCardStatusInput) {
  const card = await findCorporateCardById(input.corporateCardId, input.organizationId);
  if (!card) throw new ApiValidationError("CorporateCard not found.", 404);
  if (card.status === "CANCELLED") throw new ApiValidationError("a cancelled corporate card cannot change status.", 409);
  return prisma.$transaction(async (tx) => {
    const result = await updateCorporateCardStatusRepo(input.corporateCardId, input.organizationId, card.status, input.status, tx);
    if (result.count === 0) throw new ApiValidationError("CorporateCard was concurrently modified; reload and retry.", 409);
    return findCorporateCardById(input.corporateCardId, input.organizationId, tx);
  });
}

export async function openCardStatement(input: OpenCardStatementInput) {
  const card = await findCorporateCardById(input.corporateCardId, input.organizationId);
  if (!card) throw new ApiValidationError("CorporateCard not found.", 404);
  if (input.periodEnd.getTime() < input.periodStart.getTime()) throw new ApiValidationError("periodEnd must not be before periodStart.", 400);
  return prisma.$transaction((tx) => createCardStatement({ organizationId: input.organizationId, corporateCardId: card.id, periodStart: input.periodStart, periodEnd: input.periodEnd, dueDate: input.dueDate, currency: card.currency, actorId: input.actorId }, tx));
}

/**
 * §Core semantic invariant — bu dönemin gerçek kart Expense'lerini (henüz
 * hiçbir statement'a atanmamış olanlarını) bulur, cardStatementId'lerini bu
 * statement'a atar, toplamlarını deterministik totalAmount yapar ve
 * statement'ı CLOSED'a çevirir — hepsi TEK transaction'da. CARD_STATEMENT
 * obligation'ının materialize edilmesi, invoice-send-handler.ts'nin
 * materializeReceivableSchedule'ı çağırma deseniyle AYNI nedenle
 * (obligation-schedule.service.ts'in materialize* fonksiyonları kendi
 * top-level prisma.$transaction'ını açar — bunu burada zaten açık bir tx
 * İÇİNDE çağırmak iç içe/çakışan bir transaction'a yol açardı) bilerek
 * transaction dışında, NON-CRITICAL bir devam adımı olarak yapılır. Kapandıktan
 * sonra bu Expense'ler artık expense.settle ile ayrıca ödenemez (bkz.
 * expense-settlement.service.ts).
 */
export async function closeCardStatement(input: CloseCardStatementInput): Promise<CloseCardStatementOutcome> {
  const outcome = await prisma.$transaction(async (tx) => {
    const statement = await findCardStatementById(input.cardStatementId, input.organizationId, tx);
    if (!statement) throw new ApiValidationError("CardStatement not found.", 404);
    if (statement.status !== "OPEN") {
      if (statement.status === "CLOSED" || statement.status === "PARTIALLY_PAID" || statement.status === "PAID") {
        return { cardStatement: statement, assignedExpenseCount: 0, replayed: true };
      }
      assertClosableCardStatementStatus(statement.status);
    }

    const expenses = await findUnassignedCardExpensesForPeriod(input.organizationId, statement.corporateCardId, statement.periodStart, statement.periodEnd, tx);
    const totalAmount = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

    if (expenses.length > 0) {
      await assignExpensesToCardStatement(expenses.map((expense) => expense.id), statement.id, input.organizationId, tx);
    }

    const closed = await closeCardStatementRow({ id: statement.id, organizationId: input.organizationId, totalAmount, closedAt: new Date() }, tx);

    return { cardStatement: closed, assignedExpenseCount: expenses.length, replayed: false };
  });

  if (!outcome.replayed && Number(outcome.cardStatement.totalAmount) > 0) {
    await materializeCardStatementPayableSchedule({ organizationId: input.organizationId, cardStatementId: outcome.cardStatement.id, actorId: input.actorId });
  }

  return outcome;
}

export async function payCardStatement(input: PayCardStatementInput): Promise<PayCardStatementOutcome | null> {
  assertPositiveAmount(input.amount);
  assertSupportedSettlementMethod(input.paymentMethod);

  const occurredAt = input.occurredAt ?? new Date();

  if (input.idempotencyKey) {
    const existing = await findCardStatementPaymentByIdempotencyKey(input.organizationId, input.cardStatementId, input.idempotencyKey);
    if (existing) return replayExistingPayment(existing, input);
  }

  for (let attempt = 1; attempt <= MAX_CONCURRENT_PAY_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction((tx) => performPay(tx, input, occurredAt));
    } catch (error) {
      if (input.idempotencyKey && isIdempotencyKeyCollision(error)) {
        const existing = await findCardStatementPaymentByIdempotencyKey(input.organizationId, input.cardStatementId, input.idempotencyKey);
        if (existing) return replayExistingPayment(existing, input);
      }
      throw error;
    }
  }
  throw new ApiValidationError("could not pay card statement due to concurrent updates; please retry.", 409);
}

async function performPay(tx: PrismaTransactionClient, input: PayCardStatementInput, occurredAt: Date): Promise<PayCardStatementOutcome | null> {
  await tx.$queryRaw`SELECT id FROM "CardStatement" WHERE id = ${input.cardStatementId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

  // §Concurrent-idempotency-under-lock — bkz. employee-advance.service.ts::performMove
  // aynı yorum: lock'u alan bir loser winner'ın etkisini görür; ceiling'den
  // ÖNCE idempotencyKey tekrar kontrol edilmezse loser kendi isteğini
  // yanlışlıkla "ceiling aşıldı" diye reddeder.
  if (input.idempotencyKey) {
    const existingAfterLock = await findCardStatementPaymentByIdempotencyKey(input.organizationId, input.cardStatementId, input.idempotencyKey, tx);
    if (existingAfterLock) return replayExistingPayment(existingAfterLock, input);
  }

  const statement = await findCardStatementById(input.cardStatementId, input.organizationId, tx);
  if (!statement) return null;
  assertPayableCardStatementStatus(statement.status);
  if (statement.totalAmount === null) throw new ApiValidationError("card statement has no finalized totalAmount.", 500);

  const currentPaid = await sumNetCardStatementPayments(input.organizationId, statement.id, tx);
  const total = Number(statement.totalAmount);
  const remaining = total - currentPaid;
  if (input.amount > remaining + AMOUNT_EPSILON) {
    throw new ApiValidationError("amount exceeds the remaining card statement balance.", 409);
  }

  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, statement.currency);
  assertCompatibility(input.paymentMethod, account, statement.currency);

  const requestHash = input.idempotencyKey
    ? computeCardStatementPaymentRequestHash({ cardStatementId: input.cardStatementId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt })
    : null;

  const payment = await createCardStatementPayment(
    {
      organizationId: input.organizationId,
      cardStatementId: input.cardStatementId,
      kind: "ORIGINAL",
      amount: input.amount,
      currency: statement.currency,
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

  const movement = await createCardStatementPaymentMovement(
    { organizationId: input.organizationId, financialAccountId: account.id, cardStatementPaymentId: payment.id, paymentMethod: input.paymentMethod, amount: input.amount, currency: statement.currency, occurredAt, direction: "OUT", provenance: { source: "cardStatement.pay", actorId: input.actorId } },
    tx,
  );

  const newPaid = currentPaid + input.amount;
  const isFullyPaid = total - newPaid <= AMOUNT_EPSILON;
  const updatedStatement = await applyCardStatementPaymentAmount({ id: statement.id, organizationId: input.organizationId, status: isFullyPaid ? "PAID" : "PARTIALLY_PAID" }, tx);
  if (!updatedStatement) return null;

  await recordCardStatementPaymentApplication({ tx, organizationId: input.organizationId, cardStatementPaymentId: payment.id, entryDate: occurredAt, amount: input.amount, currency: statement.currency });

  return { cardStatement: updatedStatement, payment, movement, replayed: false };
}

async function replayExistingPayment(existing: CardStatementPayment, input: PayCardStatementInput): Promise<PayCardStatementOutcome> {
  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, existing.currency);
  const requestHash = computeCardStatementPaymentRequestHash({ cardStatementId: input.cardStatementId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt });
  if (existing.requestHash !== requestHash) throw new ApiValidationError("Idempotency-Key was already used with a different request.", 409);

  const [cardStatement, movement] = await Promise.all([
    findCardStatementById(input.cardStatementId, input.organizationId),
    prisma.financialAccountMovement.findFirst({ where: { organizationId: input.organizationId, cardStatementPaymentId: existing.id } }),
  ]);
  if (!cardStatement || !movement) throw new ApiValidationError("Idempotency key conflict detected but the original record could not be found.", 500);
  return { cardStatement, payment: existing, movement, replayed: true };
}

export async function reverseCardStatementPayment(input: ReverseCardStatementPaymentInput): Promise<ReverseCardStatementPaymentOutcome | null> {
  if (!input.reason?.trim()) throw new ApiValidationError("reason is required to reverse a card statement payment.", 400);

  try {
    return await prisma.$transaction((tx) => performReverse(tx, input));
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) {
      const existing = await findCardStatementPaymentByReversalOfId(input.organizationId, input.cardStatementPaymentId);
      if (existing) {
        const cardStatement = await findCardStatementById(existing.cardStatementId, input.organizationId);
        if (cardStatement && existing.movement) return { cardStatement, payment: existing, movement: existing.movement };
      }
    }
    throw error;
  }
}

async function performReverse(tx: PrismaTransactionClient, input: ReverseCardStatementPaymentInput): Promise<ReverseCardStatementPaymentOutcome | null> {
  const original = await findCardStatementPaymentForReversal(input.organizationId, input.cardStatementPaymentId, tx);
  if (!original) return null;
  if (original.kind === "REVERSAL") throw new ApiValidationError("a reversal cannot itself be reversed.", 409);
  if (original.reversal) throw new ApiValidationError("this card statement payment has already been reversed.", 409);
  if (!original.movement) throw new ApiValidationError("card statement payment is missing its movement record.", 500);

  const occurredAt = input.occurredAt ?? new Date();
  const amount = Number(original.amount);

  const reversal = await createCardStatementPayment(
    { organizationId: input.organizationId, cardStatementId: original.cardStatementId, kind: "REVERSAL", amount, currency: original.currency, paymentMethod: original.paymentMethod, financialAccountId: original.financialAccountId, occurredAt, idempotencyKey: null, requestHash: null, reason: input.reason.trim(), actorId: input.actorId, reversalOfId: original.id },
    tx,
  );

  const reversalMovement = await createCardStatementPaymentMovement(
    { organizationId: input.organizationId, financialAccountId: original.financialAccountId, cardStatementPaymentId: reversal.id, paymentMethod: original.paymentMethod, amount, currency: original.currency, occurredAt, direction: "IN", provenance: { source: "cardStatement.payment.reverse", actorId: input.actorId, reversalOf: original.id }, reversalOfId: original.movement.id },
    tx,
  );

  const netApplied = await sumNetCardStatementPayments(input.organizationId, original.cardStatementId, tx);
  const statement = await findCardStatementById(original.cardStatementId, input.organizationId, tx);
  if (!statement || statement.totalAmount === null) throw new ApiValidationError("CardStatement not found.", 404);
  const total = Number(statement.totalAmount);
  const isFullyPaid = total - netApplied <= AMOUNT_EPSILON;
  const updatedStatement = await applyCardStatementPaymentAmount({ id: original.cardStatementId, organizationId: input.organizationId, status: netApplied <= AMOUNT_EPSILON ? "CLOSED" : isFullyPaid ? "PAID" : "PARTIALLY_PAID" }, tx);
  if (!updatedStatement) throw new ApiValidationError("CardStatement not found.", 404);

  await reverseSourceEntries({ tx, organizationId: input.organizationId, sourceType: "CARD_STATEMENT_PAYMENT", sourceId: original.id, entryDate: occurredAt });

  return { cardStatement: updatedStatement, payment: reversal, movement: reversalMovement };
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

export type { CardStatementPayment, FinancialAccountMovement };
