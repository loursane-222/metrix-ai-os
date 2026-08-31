import type { LoanDrawdown, LoanRepayment } from "@prisma/client";

import { ApiValidationError } from "@/lib/api/validation";
import { isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { recordLoanDrawdown as recordLoanDrawdownLedgerEntry, recordLoanRepayment as recordLoanRepaymentLedgerEntry, reverseSourceEntries } from "@/lib/accounting/ledger.service";
import { materializeLoanInstallmentPayableSchedule } from "@/lib/core/obligations/obligation-schedule.service";
import {
  FinancialAccountValidationError,
  assertMethodAccountCompatibility,
  assertTransactionCurrencyMatchesAccount,
  listFinancialAccounts,
  resolveFinancialAccount,
} from "@/lib/financial-accounts";

import {
  AMOUNT_EPSILON,
  assertActiveLoanStatus,
  assertNonEmpty,
  assertPortionsMatchAmount,
  assertPositiveAmount,
  assertSupportedSettlementMethod,
  assertValidInstallmentSchedule,
  computeLoanDrawdownRequestHash,
  computeLoanRepaymentRequestHash,
} from "./loan.contract";
import {
  createLoanDrawdown,
  createLoanFinancialMovement,
  createLoanRepayment,
  createLoanWithInstallments,
  findLoanById,
  findLoanDrawdownByIdempotencyKey,
  findLoanDrawdownByReversalOfId,
  findLoanDrawdownForReversal,
  findLoanInstallmentById,
  findLoanRepaymentByIdempotencyKey,
  findLoanRepaymentByReversalOfId,
  findLoanRepaymentForReversal,
  sumNetLoanDrawdowns,
  sumNetLoanRepayments,
} from "./loan.repository";
import type {
  CreateLoanInput,
  CreateLoanOutcome,
  DrawLoanInput,
  DrawLoanOutcome,
  RepayLoanInstallmentInput,
  RepayLoanInstallmentOutcome,
  ReverseLoanDrawdownInput,
  ReverseLoanDrawdownOutcome,
  ReverseLoanRepaymentInput,
  ReverseLoanRepaymentOutcome,
} from "./loan.types";

const MAX_CONCURRENT_ATTEMPTS = 5;

/**
 * Loan + LoanInstallment satırları bir transaction'da yaratılır; her
 * installment'ın LOAN_INSTALLMENT obligation'a materialize edilmesi
 * (closeCardStatement'taki AYNI nedenle — materialize* kendi top-level
 * transaction'ını açar) bilerek transaction dışında, NON-CRITICAL bir devam
 * adımı olarak yapılır.
 */
export async function createNewLoan(input: CreateLoanInput): Promise<CreateLoanOutcome> {
  assertNonEmpty(input.lenderName, "lenderName");
  assertPositiveAmount(input.principalAmount, "principalAmount");
  assertValidInstallmentSchedule(input.installments, input.principalAmount);

  const { loan, installments } = await prisma.$transaction((tx) => createLoanWithInstallments(input, tx));

  for (const installment of installments) {
    await materializeLoanInstallmentPayableSchedule({ organizationId: input.organizationId, loanInstallmentId: installment.id, actorId: input.actorId });
  }

  return { loan, installments };
}

/** §Loan principal received ≠ revenue — net drawdowns loan.principalAmount tavanını aşamaz. */
export async function drawLoan(input: DrawLoanInput): Promise<DrawLoanOutcome | null> {
  assertPositiveAmount(input.amount);
  assertSupportedSettlementMethod(input.paymentMethod);

  const occurredAt = input.occurredAt ?? new Date();

  if (input.idempotencyKey) {
    const existing = await findLoanDrawdownByIdempotencyKey(input.organizationId, input.loanId, input.idempotencyKey);
    if (existing) return replayExistingDrawdown(existing, input);
  }

  for (let attempt = 1; attempt <= MAX_CONCURRENT_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction((tx) => performDraw(tx, input, occurredAt));
    } catch (error) {
      if (input.idempotencyKey && isIdempotencyKeyCollision(error)) {
        const existing = await findLoanDrawdownByIdempotencyKey(input.organizationId, input.loanId, input.idempotencyKey);
        if (existing) return replayExistingDrawdown(existing, input);
      }
      throw error;
    }
  }
  throw new ApiValidationError("could not draw loan due to concurrent updates; please retry.", 409);
}

async function performDraw(tx: PrismaTransactionClient, input: DrawLoanInput, occurredAt: Date): Promise<DrawLoanOutcome | null> {
  await tx.$queryRaw`SELECT id FROM "Loan" WHERE id = ${input.loanId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

  // §Concurrent-idempotency-under-lock — bkz. employee-advance.service.ts::performMove.
  if (input.idempotencyKey) {
    const existingAfterLock = await findLoanDrawdownByIdempotencyKey(input.organizationId, input.loanId, input.idempotencyKey, tx);
    if (existingAfterLock) return replayExistingDrawdown(existingAfterLock, input);
  }

  const loan = await findLoanById(input.loanId, input.organizationId, tx);
  if (!loan) return null;
  assertActiveLoanStatus(loan.status);

  const drawnSoFar = await sumNetLoanDrawdowns(input.organizationId, loan.id, tx);
  const remaining = Number(loan.principalAmount) - drawnSoFar;
  if (input.amount > remaining + AMOUNT_EPSILON) throw new ApiValidationError("amount exceeds the loan's remaining undrawn principal.", 409);

  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, loan.currency);
  assertCompatibility(input.paymentMethod, account, loan.currency);

  const requestHash = input.idempotencyKey ? computeLoanDrawdownRequestHash({ loanId: input.loanId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt }) : null;

  const drawdown = await createLoanDrawdown(
    { organizationId: input.organizationId, loanId: loan.id, kind: "ORIGINAL", amount: input.amount, currency: loan.currency, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt, idempotencyKey: input.idempotencyKey ?? null, requestHash, reason: null, actorId: input.actorId },
    tx,
  );

  const movement = await createLoanFinancialMovement(
    { organizationId: input.organizationId, financialAccountId: account.id, loanDrawdownId: drawdown.id, paymentMethod: input.paymentMethod, amount: input.amount, currency: loan.currency, occurredAt, direction: "IN", provenance: { source: "loan.draw", actorId: input.actorId } },
    tx,
  );

  await recordLoanDrawdownLedgerEntry({ tx, organizationId: input.organizationId, loanDrawdownId: drawdown.id, entryDate: occurredAt, amount: input.amount, currency: loan.currency });

  return { loan, drawdown, movement, replayed: false };
}

async function replayExistingDrawdown(existing: LoanDrawdown, input: DrawLoanInput): Promise<DrawLoanOutcome> {
  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, existing.currency);
  const requestHash = computeLoanDrawdownRequestHash({ loanId: input.loanId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt });
  if (existing.requestHash !== requestHash) throw new ApiValidationError("Idempotency-Key was already used with a different request.", 409);

  const [loan, movement] = await Promise.all([
    findLoanById(input.loanId, input.organizationId),
    prisma.financialAccountMovement.findFirst({ where: { organizationId: input.organizationId, loanDrawdownId: existing.id } }),
  ]);
  if (!loan || !movement) throw new ApiValidationError("Idempotency key conflict detected but the original record could not be found.", 500);
  return { loan, drawdown: existing, movement, replayed: true };
}

export async function reverseLoanDrawdown(input: ReverseLoanDrawdownInput): Promise<ReverseLoanDrawdownOutcome | null> {
  if (!input.reason?.trim()) throw new ApiValidationError("reason is required to reverse a loan drawdown.", 400);

  try {
    return await prisma.$transaction((tx) => performReverseDrawdown(tx, input));
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) {
      const existing = await findLoanDrawdownByReversalOfId(input.organizationId, input.loanDrawdownId);
      if (existing?.movement) return { drawdown: existing, movement: existing.movement };
    }
    throw error;
  }
}

async function performReverseDrawdown(tx: PrismaTransactionClient, input: ReverseLoanDrawdownInput): Promise<ReverseLoanDrawdownOutcome | null> {
  const original = await findLoanDrawdownForReversal(input.organizationId, input.loanDrawdownId, tx);
  if (!original) return null;
  if (original.kind === "REVERSAL") throw new ApiValidationError("a reversal cannot itself be reversed.", 409);
  if (original.reversal) throw new ApiValidationError("this loan drawdown has already been reversed.", 409);
  if (!original.movement) throw new ApiValidationError("loan drawdown is missing its movement record.", 500);

  const occurredAt = input.occurredAt ?? new Date();
  const amount = Number(original.amount);

  const reversal = await createLoanDrawdown(
    { organizationId: input.organizationId, loanId: original.loanId, kind: "REVERSAL", amount, currency: original.currency, paymentMethod: original.paymentMethod, financialAccountId: original.financialAccountId, occurredAt, idempotencyKey: null, requestHash: null, reason: input.reason.trim(), actorId: input.actorId, reversalOfId: original.id },
    tx,
  );

  const reversalMovement = await createLoanFinancialMovement(
    { organizationId: input.organizationId, financialAccountId: original.financialAccountId, loanDrawdownId: reversal.id, paymentMethod: original.paymentMethod, amount, currency: original.currency, occurredAt, direction: "OUT", provenance: { source: "loan.drawdown.reverse", actorId: input.actorId, reversalOf: original.id }, reversalOfId: original.movement.id },
    tx,
  );

  await reverseSourceEntries({ tx, organizationId: input.organizationId, sourceType: "LOAN_DRAWDOWN", sourceId: original.id, entryDate: occurredAt });

  return { drawdown: reversal, movement: reversalMovement };
}

/** §Principal repayment ≠ expense; interest = expense — bkz. loan.contract.ts::assertPortionsMatchAmount. */
export async function repayLoanInstallment(input: RepayLoanInstallmentInput): Promise<RepayLoanInstallmentOutcome | null> {
  assertPositiveAmount(input.amount);
  const interestPortion = input.interestPortion ?? 0;
  assertPortionsMatchAmount(input.amount, input.principalPortion, interestPortion);
  assertSupportedSettlementMethod(input.paymentMethod);

  const occurredAt = input.occurredAt ?? new Date();

  if (input.idempotencyKey) {
    const existing = await findLoanRepaymentByIdempotencyKey(input.organizationId, input.loanInstallmentId, input.idempotencyKey);
    if (existing) return replayExistingRepayment(existing, input);
  }

  for (let attempt = 1; attempt <= MAX_CONCURRENT_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction((tx) => performRepay(tx, input, occurredAt, interestPortion));
    } catch (error) {
      if (input.idempotencyKey && isIdempotencyKeyCollision(error)) {
        const existing = await findLoanRepaymentByIdempotencyKey(input.organizationId, input.loanInstallmentId, input.idempotencyKey);
        if (existing) return replayExistingRepayment(existing, input);
      }
      throw error;
    }
  }
  throw new ApiValidationError("could not repay loan installment due to concurrent updates; please retry.", 409);
}

async function performRepay(tx: PrismaTransactionClient, input: RepayLoanInstallmentInput, occurredAt: Date, interestPortion: number): Promise<RepayLoanInstallmentOutcome | null> {
  await tx.$queryRaw`SELECT id FROM "LoanInstallment" WHERE id = ${input.loanInstallmentId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

  // §Concurrent-idempotency-under-lock — bkz. employee-advance.service.ts::performMove.
  if (input.idempotencyKey) {
    const existingAfterLock = await findLoanRepaymentByIdempotencyKey(input.organizationId, input.loanInstallmentId, input.idempotencyKey, tx);
    if (existingAfterLock) return replayExistingRepayment(existingAfterLock, input);
  }

  const installment = await findLoanInstallmentById(input.loanInstallmentId, input.organizationId, tx);
  if (!installment) return null;

  const total = Number(installment.principalAmount) + Number(installment.interestAmount);
  const repaidSoFar = await sumNetLoanRepayments(input.organizationId, installment.id, tx);
  const remaining = total - repaidSoFar;
  if (input.amount > remaining + AMOUNT_EPSILON) throw new ApiValidationError("amount exceeds the remaining balance of this loan installment.", 409);

  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, installment.currency);
  assertCompatibility(input.paymentMethod, account, installment.currency);

  const requestHash = input.idempotencyKey ? computeLoanRepaymentRequestHash({ loanInstallmentId: input.loanInstallmentId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt }) : null;

  const repayment = await createLoanRepayment(
    { organizationId: input.organizationId, loanInstallmentId: installment.id, kind: "ORIGINAL", amount: input.amount, principalPortion: input.principalPortion, interestPortion, currency: installment.currency, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt, idempotencyKey: input.idempotencyKey ?? null, requestHash, reason: null, actorId: input.actorId },
    tx,
  );

  const movement = await createLoanFinancialMovement(
    { organizationId: input.organizationId, financialAccountId: account.id, loanRepaymentId: repayment.id, paymentMethod: input.paymentMethod, amount: input.amount, currency: installment.currency, occurredAt, direction: "OUT", provenance: { source: "loan.installment.repay", actorId: input.actorId } },
    tx,
  );

  await recordLoanRepaymentLedgerEntry({ tx, organizationId: input.organizationId, loanRepaymentId: repayment.id, entryDate: occurredAt, principalPortion: input.principalPortion, interestPortion, currency: installment.currency });

  return { repayment, movement, replayed: false };
}

async function replayExistingRepayment(existing: LoanRepayment, input: RepayLoanInstallmentInput): Promise<RepayLoanInstallmentOutcome> {
  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, existing.currency);
  const requestHash = computeLoanRepaymentRequestHash({ loanInstallmentId: input.loanInstallmentId, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt });
  if (existing.requestHash !== requestHash) throw new ApiValidationError("Idempotency-Key was already used with a different request.", 409);

  const movement = await prisma.financialAccountMovement.findFirst({ where: { organizationId: input.organizationId, loanRepaymentId: existing.id } });
  if (!movement) throw new ApiValidationError("Idempotency key conflict detected but the original record could not be found.", 500);
  return { repayment: existing, movement, replayed: true };
}

export async function reverseLoanRepayment(input: ReverseLoanRepaymentInput): Promise<ReverseLoanRepaymentOutcome | null> {
  if (!input.reason?.trim()) throw new ApiValidationError("reason is required to reverse a loan repayment.", 400);

  try {
    return await prisma.$transaction((tx) => performReverseRepayment(tx, input));
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) {
      const existing = await findLoanRepaymentByReversalOfId(input.organizationId, input.loanRepaymentId);
      if (existing?.movement) return { repayment: existing, movement: existing.movement };
    }
    throw error;
  }
}

async function performReverseRepayment(tx: PrismaTransactionClient, input: ReverseLoanRepaymentInput): Promise<ReverseLoanRepaymentOutcome | null> {
  const original = await findLoanRepaymentForReversal(input.organizationId, input.loanRepaymentId, tx);
  if (!original) return null;
  if (original.kind === "REVERSAL") throw new ApiValidationError("a reversal cannot itself be reversed.", 409);
  if (original.reversal) throw new ApiValidationError("this loan repayment has already been reversed.", 409);
  if (!original.movement) throw new ApiValidationError("loan repayment is missing its movement record.", 500);

  const occurredAt = input.occurredAt ?? new Date();
  const amount = Number(original.amount);

  const reversal = await createLoanRepayment(
    { organizationId: input.organizationId, loanInstallmentId: original.loanInstallmentId, kind: "REVERSAL", amount, principalPortion: Number(original.principalPortion), interestPortion: Number(original.interestPortion), currency: original.currency, paymentMethod: original.paymentMethod, financialAccountId: original.financialAccountId, occurredAt, idempotencyKey: null, requestHash: null, reason: input.reason.trim(), actorId: input.actorId, reversalOfId: original.id },
    tx,
  );

  const reversalMovement = await createLoanFinancialMovement(
    { organizationId: input.organizationId, financialAccountId: original.financialAccountId, loanRepaymentId: reversal.id, paymentMethod: original.paymentMethod, amount, currency: original.currency, occurredAt, direction: "IN", provenance: { source: "loan.repayment.reverse", actorId: input.actorId, reversalOf: original.id }, reversalOfId: original.movement.id },
    tx,
  );

  await reverseSourceEntries({ tx, organizationId: input.organizationId, sourceType: "LOAN_REPAYMENT", sourceId: original.id, entryDate: occurredAt });

  return { repayment: reversal, movement: reversalMovement };
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
