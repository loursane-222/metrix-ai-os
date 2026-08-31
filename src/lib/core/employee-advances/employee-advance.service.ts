import type { EmployeeAdvanceMovement, EmployeeAdvanceReconciliation, EmployeeAdvanceStatus } from "@prisma/client";

import { ApiValidationError } from "@/lib/api/validation";
import { isIdempotencyKeyCollision } from "@/lib/core/shared/idempotency";
import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { recordEmployeeAdvanceMovement as recordAdvanceMovementLedgerEntry, recordEmployeeAdvanceReconciliation as recordAdvanceReconciliationLedgerEntry, reverseSourceEntries } from "@/lib/accounting/ledger.service";
import { applyExpenseSettlementAmount, findExpenseByIdForOrganization } from "@/lib/core/expenses/expense-repository";
import {
  FinancialAccountValidationError,
  assertMethodAccountCompatibility,
  assertTransactionCurrencyMatchesAccount,
  listFinancialAccounts,
  resolveFinancialAccount,
} from "@/lib/financial-accounts";

import {
  AMOUNT_EPSILON,
  assertActiveAdvanceStatus,
  assertNonEmpty,
  assertPositiveAmount,
  assertSupportedSettlementMethod,
  computeAdvanceMovementRequestHash,
} from "./employee-advance.contract";
import {
  createAdvanceFinancialMovement,
  createAdvanceMovement,
  createAdvanceReconciliation,
  createEmployeeAdvance,
  findAdvanceMovementByIdempotencyKey,
  findAdvanceMovementByReversalOfId,
  findAdvanceMovementForReversal,
  findAdvanceReconciliationByIdempotencyKey,
  findAdvanceReconciliationByReversalOfId,
  findAdvanceReconciliationForReversal,
  findEmployeeAdvanceById,
  sumNetAdvanceMovementsByDirection,
  sumNetAdvanceReconciliations,
  sumNetReconciliationsForExpense,
  updateEmployeeAdvanceProjection,
} from "./employee-advance.repository";
import type {
  CreateEmployeeAdvanceInput,
  DisburseOrReturnAdvanceInput,
  DisburseOrReturnAdvanceOutcome,
  ReconcileAdvanceInput,
  ReconcileAdvanceOutcome,
  ReverseAdvanceMovementInput,
  ReverseAdvanceMovementOutcome,
  ReverseAdvanceReconciliationInput,
  ReverseAdvanceReconciliationOutcome,
} from "./employee-advance.types";

const MAX_CONCURRENT_ATTEMPTS = 5;

export async function createNewEmployeeAdvance(input: CreateEmployeeAdvanceInput) {
  assertNonEmpty(input.employeeMemberId, "employeeMemberId");
  assertPositiveAmount(input.amount);
  return prisma.$transaction((tx) => createEmployeeAdvance(input, tx));
}

/** Outstanding = disbursed(OUT net) - returned(IN net) - reconciled(net). */
async function computeOutstanding(organizationId: string, employeeAdvanceId: string, tx: PrismaTransactionClient): Promise<{ disbursed: number; returned: number; reconciled: number; outstanding: number }> {
  const [disbursed, returned, reconciled] = await Promise.all([
    sumNetAdvanceMovementsByDirection(organizationId, employeeAdvanceId, "OUT", tx),
    sumNetAdvanceMovementsByDirection(organizationId, employeeAdvanceId, "IN", tx),
    sumNetAdvanceReconciliations(organizationId, employeeAdvanceId, tx),
  ]);
  return { disbursed, returned, reconciled, outstanding: disbursed - returned - reconciled };
}

function projectAdvanceStatus(advanceAmount: number, outstanding: number, reconciled: number): EmployeeAdvanceStatus {
  if (outstanding <= AMOUNT_EPSILON) return reconciled > AMOUNT_EPSILON ? "RECONCILED" : "OUTSTANDING";
  if (reconciled > AMOUNT_EPSILON) return "PARTIALLY_RECONCILED";
  return "OUTSTANDING";
}

/**
 * direction=OUT: disbursement (avans veriliyor) — advance.amount tavanını
 * aşamaz. direction=IN: return (kullanılmayan avans iade ediliyor) —
 * o anki outstanding'i aşamaz. Her iki yön de gerçek bir
 * FinancialAccountMovement üretir (Settlement'ın generalized direction
 * deseni).
 */
export async function moveEmployeeAdvance(input: DisburseOrReturnAdvanceInput): Promise<DisburseOrReturnAdvanceOutcome | null> {
  assertPositiveAmount(input.amount);
  assertSupportedSettlementMethod(input.paymentMethod);

  const occurredAt = input.occurredAt ?? new Date();

  if (input.idempotencyKey) {
    const existing = await findAdvanceMovementByIdempotencyKey(input.organizationId, input.employeeAdvanceId, input.idempotencyKey);
    if (existing) return replayExistingMovement(existing, input);
  }

  for (let attempt = 1; attempt <= MAX_CONCURRENT_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction((tx) => performMove(tx, input, occurredAt));
    } catch (error) {
      if (input.idempotencyKey && isIdempotencyKeyCollision(error)) {
        const existing = await findAdvanceMovementByIdempotencyKey(input.organizationId, input.employeeAdvanceId, input.idempotencyKey);
        if (existing) return replayExistingMovement(existing, input);
      }
      throw error;
    }
  }
  throw new ApiValidationError("could not move employee advance due to concurrent updates; please retry.", 409);
}

async function performMove(tx: PrismaTransactionClient, input: DisburseOrReturnAdvanceInput, occurredAt: Date): Promise<DisburseOrReturnAdvanceOutcome | null> {
  await tx.$queryRaw`SELECT id FROM "EmployeeAdvance" WHERE id = ${input.employeeAdvanceId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

  // §Concurrent-idempotency-under-lock: bir eşzamanlı loser burada tam da
  // winner'ın satırı commit olduğu için lock'u alabilmiştir — winner'ın
  // etkisini (disbursed/outstanding artmış olarak) GÖRECEKTİR. Ceiling
  // kontrolünden ÖNCE idempotencyKey'i tekrar kontrol etmezsek, loser
  // kendi (aslında aynı) isteğini "ceiling aşıldı" diye REDDEDER —
  // idempotent replay yerine yanlış bir 409 üretir. Bu yüzden lock
  // alındıktan hemen sonra, herhangi bir ceiling/iş kuralı değerlendirmeden
  // ÖNCE tekrar kontrol edilir.
  if (input.idempotencyKey) {
    const existingAfterLock = await findAdvanceMovementByIdempotencyKey(input.organizationId, input.employeeAdvanceId, input.idempotencyKey, tx);
    if (existingAfterLock) return replayExistingMovement(existingAfterLock, input);
  }

  const advance = await findEmployeeAdvanceById(input.employeeAdvanceId, input.organizationId, tx);
  if (!advance) return null;
  assertActiveAdvanceStatus(advance.status);

  const { disbursed, returned, outstanding, reconciled } = await computeOutstanding(input.organizationId, advance.id, tx);
  if (input.direction === "OUT") {
    const remaining = Number(advance.amount) - disbursed;
    if (input.amount > remaining + AMOUNT_EPSILON) throw new ApiValidationError("amount exceeds the remaining approved advance amount.", 409);
  } else {
    if (input.amount > outstanding + AMOUNT_EPSILON) throw new ApiValidationError("amount exceeds the currently outstanding advance balance.", 409);
  }

  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, advance.currency);
  assertCompatibility(input.paymentMethod, account, advance.currency);

  const requestHash = input.idempotencyKey
    ? computeAdvanceMovementRequestHash({ employeeAdvanceId: input.employeeAdvanceId, direction: input.direction, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt })
    : null;

  const movement = await createAdvanceMovement(
    { organizationId: input.organizationId, employeeAdvanceId: advance.id, kind: "ORIGINAL", direction: input.direction, amount: input.amount, currency: advance.currency, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt, idempotencyKey: input.idempotencyKey ?? null, requestHash, reason: null, actorId: input.actorId },
    tx,
  );

  const financialAccountMovement = await createAdvanceFinancialMovement(
    { organizationId: input.organizationId, financialAccountId: account.id, employeeAdvanceMovementId: movement.id, paymentMethod: input.paymentMethod, amount: input.amount, currency: advance.currency, occurredAt, direction: input.direction, provenance: { source: "employeeAdvance.move", actorId: input.actorId } },
    tx,
  );

  await recordAdvanceMovementLedgerEntry({ tx, organizationId: input.organizationId, employeeAdvanceMovementId: movement.id, entryDate: occurredAt, amount: input.amount, currency: advance.currency, direction: input.direction });

  const newDisbursed = input.direction === "OUT" ? disbursed + input.amount : disbursed;
  const newReturned = input.direction === "IN" ? returned + input.amount : returned;
  const newOutstanding = newDisbursed - newReturned - reconciled;
  const updatedAdvance = await updateEmployeeAdvanceProjection({ id: advance.id, organizationId: input.organizationId, reconciledAmount: reconciled, status: projectAdvanceStatus(Number(advance.amount), newOutstanding, reconciled) }, tx);

  return { employeeAdvance: updatedAdvance, movement, financialAccountMovement, replayed: false };
}

async function replayExistingMovement(existing: EmployeeAdvanceMovement, input: DisburseOrReturnAdvanceInput): Promise<DisburseOrReturnAdvanceOutcome> {
  const account = await resolveAccountOrThrow(input.organizationId, input.financialAccountReference, existing.currency);
  const requestHash = computeAdvanceMovementRequestHash({ employeeAdvanceId: input.employeeAdvanceId, direction: input.direction, amount: input.amount, paymentMethod: input.paymentMethod, financialAccountId: account.id, occurredAt: input.occurredAt });
  if (existing.requestHash !== requestHash) throw new ApiValidationError("Idempotency-Key was already used with a different request.", 409);

  const [advance, financialAccountMovement] = await Promise.all([
    findEmployeeAdvanceById(input.employeeAdvanceId, input.organizationId),
    prisma.financialAccountMovement.findFirst({ where: { organizationId: input.organizationId, employeeAdvanceMovementId: existing.id } }),
  ]);
  if (!advance || !financialAccountMovement) throw new ApiValidationError("Idempotency key conflict detected but the original record could not be found.", 500);
  return { employeeAdvance: advance, movement: existing, financialAccountMovement, replayed: true };
}

export async function reverseEmployeeAdvanceMovement(input: ReverseAdvanceMovementInput): Promise<ReverseAdvanceMovementOutcome | null> {
  if (!input.reason?.trim()) throw new ApiValidationError("reason is required to reverse an employee advance movement.", 400);

  try {
    return await prisma.$transaction((tx) => performReverseMovement(tx, input));
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) {
      const existing = await findAdvanceMovementByReversalOfId(input.organizationId, input.employeeAdvanceMovementId);
      if (existing) {
        const advance = await findEmployeeAdvanceById(existing.employeeAdvanceId, input.organizationId);
        if (advance && existing.movement) return { employeeAdvance: advance, movement: existing, financialAccountMovement: existing.movement };
      }
    }
    throw error;
  }
}

async function performReverseMovement(tx: PrismaTransactionClient, input: ReverseAdvanceMovementInput): Promise<ReverseAdvanceMovementOutcome | null> {
  const original = await findAdvanceMovementForReversal(input.organizationId, input.employeeAdvanceMovementId, tx);
  if (!original) return null;
  if (original.kind === "REVERSAL") throw new ApiValidationError("a reversal cannot itself be reversed.", 409);
  if (original.reversal) throw new ApiValidationError("this employee advance movement has already been reversed.", 409);
  if (!original.movement) throw new ApiValidationError("employee advance movement is missing its financial account movement record.", 500);

  await tx.$queryRaw`SELECT id FROM "EmployeeAdvance" WHERE id = ${original.employeeAdvanceId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

  const occurredAt = input.occurredAt ?? new Date();
  const amount = Number(original.amount);
  const reversedDirection = original.direction === "OUT" ? "IN" : "OUT";

  const reversal = await createAdvanceMovement(
    { organizationId: input.organizationId, employeeAdvanceId: original.employeeAdvanceId, kind: "REVERSAL", direction: original.direction, amount, currency: original.currency, paymentMethod: original.paymentMethod, financialAccountId: original.financialAccountId, occurredAt, idempotencyKey: null, requestHash: null, reason: input.reason.trim(), actorId: input.actorId, reversalOfId: original.id },
    tx,
  );

  const financialAccountMovement = await createAdvanceFinancialMovement(
    { organizationId: input.organizationId, financialAccountId: original.financialAccountId, employeeAdvanceMovementId: reversal.id, paymentMethod: original.paymentMethod, amount, currency: original.currency, occurredAt, direction: reversedDirection, provenance: { source: "employeeAdvance.movement.reverse", actorId: input.actorId, reversalOf: original.id }, reversalOfId: original.movement.id },
    tx,
  );

  await reverseSourceEntries({ tx, organizationId: input.organizationId, sourceType: "EMPLOYEE_ADVANCE_MOVEMENT", sourceId: original.id, entryDate: occurredAt });

  const advance = await findEmployeeAdvanceById(original.employeeAdvanceId, input.organizationId, tx);
  if (!advance) throw new ApiValidationError("EmployeeAdvance not found.", 404);
  const { reconciled, outstanding } = await computeOutstanding(input.organizationId, advance.id, tx);
  const updatedAdvance = await updateEmployeeAdvanceProjection({ id: advance.id, organizationId: input.organizationId, reconciledAmount: reconciled, status: projectAdvanceStatus(Number(advance.amount), outstanding, reconciled) }, tx);

  return { employeeAdvance: updatedAdvance, movement: reversal, financialAccountMovement };
}

/**
 * §Double-count prevention — Expense'in kendi ceiling'i
 * (expense.amount - expense.paidAmount(GERÇEK NAKİT, dokunulmaz) -
 * sumNetReconciliationsForExpense(zaten avansla kapanmış)) ile Advance'in
 * kendi ceiling'i (outstanding) AYNI ANDA kontrol edilir — financial-instrument
 * ::applyInstrumentToObligation'ın "instrument yüzü + obligation ceiling"
 * çift kontrolüyle birebir aynı prensip.
 */
export async function reconcileEmployeeAdvance(input: ReconcileAdvanceInput): Promise<ReconcileAdvanceOutcome | null> {
  assertPositiveAmount(input.amount);
  assertNonEmpty(input.expenseId, "expenseId");

  const occurredAt = input.occurredAt ?? new Date();

  if (input.idempotencyKey) {
    const existing = await findAdvanceReconciliationByIdempotencyKey(input.organizationId, input.employeeAdvanceId, input.expenseId, input.idempotencyKey);
    if (existing) return replayExistingReconciliation(existing, input);
  }

  for (let attempt = 1; attempt <= MAX_CONCURRENT_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction((tx) => performReconcile(tx, input, occurredAt));
    } catch (error) {
      if (input.idempotencyKey && isIdempotencyKeyCollision(error)) {
        const existing = await findAdvanceReconciliationByIdempotencyKey(input.organizationId, input.employeeAdvanceId, input.expenseId, input.idempotencyKey);
        if (existing) return replayExistingReconciliation(existing, input);
      }
      throw error;
    }
  }
  throw new ApiValidationError("could not reconcile employee advance due to concurrent updates; please retry.", 409);
}

async function performReconcile(tx: PrismaTransactionClient, input: ReconcileAdvanceInput, occurredAt: Date): Promise<ReconcileAdvanceOutcome | null> {
  // Deterministik lock sırası: advance sonra expense — reverseAdvanceMovement
  // ve reverseAdvanceReconciliation de yalnız advance'i kilitler, yalnız bu
  // fonksiyon ikisini birden kilitler, her zaman bu sırada.
  await tx.$queryRaw`SELECT id FROM "EmployeeAdvance" WHERE id = ${input.employeeAdvanceId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

  // §Concurrent-idempotency-under-lock — bkz. performMove'daki aynı yorum.
  if (input.idempotencyKey) {
    const existingAfterLock = await findAdvanceReconciliationByIdempotencyKey(input.organizationId, input.employeeAdvanceId, input.expenseId, input.idempotencyKey, tx);
    if (existingAfterLock) return replayExistingReconciliation(existingAfterLock, input);
  }

  const advance = await findEmployeeAdvanceById(input.employeeAdvanceId, input.organizationId, tx);
  if (!advance) return null;
  assertActiveAdvanceStatus(advance.status);

  await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${input.expenseId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;
  const expense = await findExpenseByIdForOrganization(input.expenseId, input.organizationId, tx);
  if (!expense) throw new ApiValidationError("Expense not found.", 404);
  if (expense.status === "CANCELLED") throw new ApiValidationError("a cancelled expense cannot be reconciled against an advance.", 409);
  if (expense.currency !== advance.currency) throw new ApiValidationError("expense currency must match the advance's currency.", 409);

  const { outstanding, reconciled } = await computeOutstanding(input.organizationId, advance.id, tx);
  if (input.amount > outstanding + AMOUNT_EPSILON) throw new ApiValidationError("amount exceeds the currently outstanding advance balance.", 409);

  const alreadyReconciledOnExpense = await sumNetReconciliationsForExpense(input.organizationId, expense.id, tx);
  const expenseRemaining = Number(expense.amount) - Number(expense.paidAmount) - alreadyReconciledOnExpense;
  if (input.amount > expenseRemaining + AMOUNT_EPSILON) throw new ApiValidationError("amount exceeds the remaining expense balance (real cash paid + already-reconciled advances considered).", 409);

  const reconciliation = await createAdvanceReconciliation(
    { organizationId: input.organizationId, employeeAdvanceId: advance.id, expenseId: expense.id, kind: "ORIGINAL", amount: input.amount, currency: advance.currency, occurredAt, idempotencyKey: input.idempotencyKey ?? null, reason: null, actorId: input.actorId },
    tx,
  );

  await recordAdvanceReconciliationLedgerEntry({ tx, organizationId: input.organizationId, employeeAdvanceReconciliationId: reconciliation.id, entryDate: occurredAt, amount: input.amount, currency: advance.currency });

  // Expense.paidAmount kendisi değişmez (yalnız nakit toplamının cache'i
  // olarak kalır — bkz. schema yorumu), ama nakit+avans-mahsup birlikte
  // total'ı ne kadar kapatıyorsa status onu yansıtmalıdır; aksi halde bu
  // gider ekonomik olarak tamamen (veya kısmen) karşılanmış olsa bile
  // sonsuza kadar PENDING görünür ("hangi giderler açık" sorgusu yanlış
  // cevap verir).
  const totalCoveredOnExpense = Number(expense.paidAmount) + alreadyReconciledOnExpense + input.amount;
  const expenseTotal = Number(expense.amount);
  const projectedExpenseStatus = totalCoveredOnExpense >= expenseTotal - AMOUNT_EPSILON ? "PAID" : totalCoveredOnExpense > AMOUNT_EPSILON ? "PARTIALLY_PAID" : expense.status;
  if (projectedExpenseStatus !== expense.status) {
    await applyExpenseSettlementAmount({ id: expense.id, organizationId: input.organizationId, paidAmount: Number(expense.paidAmount), status: projectedExpenseStatus }, tx);
  }

  const newReconciled = reconciled + input.amount;
  const newOutstanding = outstanding - input.amount;
  const updatedAdvance = await updateEmployeeAdvanceProjection({ id: advance.id, organizationId: input.organizationId, reconciledAmount: newReconciled, status: projectAdvanceStatus(Number(advance.amount), newOutstanding, newReconciled) }, tx);

  return { employeeAdvance: updatedAdvance, reconciliation, replayed: false };
}

/**
 * EmployeeAdvanceReconciliation'ın requestHash kolonu yok (nakit hareketi
 * üretmediği için CardStatementPayment/EmployeeAdvanceMovement'ın aksine
 * dış bir replay-mismatch riski taşımaz) — burada idempotency doğrulaması
 * amount/expenseId eşleşmesiyle yapılır; eşleşmezse aynı key farklı bir
 * istek için kullanılmış demektir.
 */
async function replayExistingReconciliation(existing: EmployeeAdvanceReconciliation, input: ReconcileAdvanceInput): Promise<ReconcileAdvanceOutcome> {
  if (Number(existing.amount) !== input.amount || existing.expenseId !== input.expenseId) {
    throw new ApiValidationError("Idempotency-Key was already used with a different request.", 409);
  }
  const advance = await findEmployeeAdvanceById(input.employeeAdvanceId, input.organizationId);
  if (!advance) throw new ApiValidationError("Idempotency key conflict detected but the original record could not be found.", 500);
  return { employeeAdvance: advance, reconciliation: existing, replayed: true };
}

export async function reverseEmployeeAdvanceReconciliation(input: ReverseAdvanceReconciliationInput): Promise<ReverseAdvanceReconciliationOutcome | null> {
  if (!input.reason?.trim()) throw new ApiValidationError("reason is required to reverse an employee advance reconciliation.", 400);

  try {
    return await prisma.$transaction((tx) => performReverseReconciliation(tx, input));
  } catch (error) {
    if (isIdempotencyKeyCollision(error)) {
      const existing = await findAdvanceReconciliationByReversalOfId(input.organizationId, input.employeeAdvanceReconciliationId);
      if (existing) {
        const advance = await findEmployeeAdvanceById(existing.employeeAdvanceId, input.organizationId);
        if (advance) return { employeeAdvance: advance, reconciliation: existing };
      }
    }
    throw error;
  }
}

async function performReverseReconciliation(tx: PrismaTransactionClient, input: ReverseAdvanceReconciliationInput): Promise<ReverseAdvanceReconciliationOutcome | null> {
  const original = await findAdvanceReconciliationForReversal(input.organizationId, input.employeeAdvanceReconciliationId, tx);
  if (!original) return null;
  if (original.kind === "REVERSAL") throw new ApiValidationError("a reversal cannot itself be reversed.", 409);
  if (original.reversal) throw new ApiValidationError("this employee advance reconciliation has already been reversed.", 409);

  await tx.$queryRaw`SELECT id FROM "EmployeeAdvance" WHERE id = ${original.employeeAdvanceId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;

  const occurredAt = input.occurredAt ?? new Date();
  const amount = Number(original.amount);

  const reversal = await createAdvanceReconciliation(
    { organizationId: input.organizationId, employeeAdvanceId: original.employeeAdvanceId, expenseId: original.expenseId, kind: "REVERSAL", amount, currency: original.currency, occurredAt, idempotencyKey: null, reason: input.reason.trim(), actorId: input.actorId, reversalOfId: original.id },
    tx,
  );

  await reverseSourceEntries({ tx, organizationId: input.organizationId, sourceType: "EMPLOYEE_ADVANCE_RECONCILIATION", sourceId: original.id, entryDate: occurredAt });

  const advance = await findEmployeeAdvanceById(original.employeeAdvanceId, input.organizationId, tx);
  if (!advance) throw new ApiValidationError("EmployeeAdvance not found.", 404);
  const { outstanding, reconciled } = await computeOutstanding(input.organizationId, advance.id, tx);
  const updatedAdvance = await updateEmployeeAdvanceProjection({ id: advance.id, organizationId: input.organizationId, reconciledAmount: reconciled, status: projectAdvanceStatus(Number(advance.amount), outstanding, reconciled) }, tx);

  // Reversal reopens the expense's coverage — reflect that on its status
  // the same way performReconcile closes it (bkz. yukarıdaki aynı yorum).
  await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${original.expenseId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;
  const expense = await findExpenseByIdForOrganization(original.expenseId, input.organizationId, tx);
  if (expense && expense.status !== "CANCELLED") {
    const stillReconciled = await sumNetReconciliationsForExpense(input.organizationId, expense.id, tx);
    const totalCoveredOnExpense = Number(expense.paidAmount) + stillReconciled;
    const expenseTotal = Number(expense.amount);
    const projectedExpenseStatus = totalCoveredOnExpense >= expenseTotal - AMOUNT_EPSILON ? "PAID" : totalCoveredOnExpense > AMOUNT_EPSILON ? "PARTIALLY_PAID" : "PENDING";
    if (projectedExpenseStatus !== expense.status) {
      await applyExpenseSettlementAmount({ id: expense.id, organizationId: input.organizationId, paidAmount: Number(expense.paidAmount), status: projectedExpenseStatus }, tx);
    }
  }

  return { employeeAdvance: updatedAdvance, reconciliation: reversal };
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
