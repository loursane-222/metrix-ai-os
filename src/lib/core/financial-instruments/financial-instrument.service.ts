import { ApiValidationError } from "@/lib/api/validation";
import { prisma } from "@/lib/core/shared/prisma";
import type { PrismaTransactionClient } from "@/lib/core/shared/prisma.types";
import { applySettlement } from "@/lib/core/settlements/settlement.service";
import { settleExpense } from "@/lib/core/expenses/expense-settlement.service";
import { applySupplierPayment } from "@/lib/core/supplier-payments/supplier-payment.service";

import {
  AMOUNT_EPSILON,
  assertAllocatableInstrumentStatus,
  assertBounceableInstrumentStatus,
  assertCancellableInstrumentStatus,
  assertClearableInstrumentStatus,
  assertDirectionMatchesObligation,
  assertPositiveAmount,
} from "./financial-instrument.contract";
import {
  createFinancialInstrument,
  createInstrumentAllocation,
  findActiveAllocationsForInstrument,
  findFinancialInstrumentById,
  findInstrumentAllocationForReversal,
  InstrumentConcurrentlyModifiedError,
  markInstrumentAllocationSettled,
  recordInstrumentStatusHistory,
  sumNetAllocationsForInstrument,
  sumNetAllocationsForObligation,
  updateInstrumentStatus,
} from "./financial-instrument.repository";
import type {
  ApplyInstrumentToObligationInput,
  ApplyInstrumentToObligationOutcome,
  BounceInstrumentInput,
  CancelInstrumentInput,
  ClearInstrumentInput,
  ClearInstrumentOutcome,
  ClearedAllocationResult,
  RegisterInstrumentInput,
} from "./financial-instrument.types";

function assert(value: string | undefined, field: string): void {
  if (!value?.trim()) throw new Error(`${field} is required.`);
}

/**
 * §Core semantic invariant — receiving/issuing an instrument is bilerek
 * yalnızca bu tabloya bir satır yazar: Settlement/SupplierPayment/
 * ExpenseSettlement/FinancialAccountMovement'a HİÇ dokunmaz. "received
 * cheque ≠ collection into CASH/BANK" ve "issued cheque ≠ immediate
 * CASH/BANK outflow" tam olarak bunun garantisidir — para henüz hareket
 * etmedi, yalnız bir enstrümanın varlığı kayda geçti.
 */
export async function registerInstrument(input: RegisterInstrumentInput): Promise<import("@prisma/client").FinancialInstrument> {
  assert(input.organizationId, "organizationId");
  assertPositiveAmount(input.amount);
  if (input.direction === "RECEIVED" && !input.customerId) throw new ApiValidationError("customerId is required for a received instrument.", 400);
  if (input.direction === "ISSUED" && !input.supplierId) throw new ApiValidationError("supplierId is required for an issued instrument.", 400);
  if (Number.isNaN(input.maturityDate.getTime())) throw new ApiValidationError("maturityDate must be a valid date.", 400);

  return prisma.$transaction(async (tx) => {
    const instrument = await createFinancialInstrument(input, tx);
    await recordInstrumentStatusHistory({ organizationId: input.organizationId, instrumentId: instrument.id, fromStatus: null, toStatus: "REGISTERED", performedById: input.actorId }, tx);
    return instrument;
  });
}

/**
 * Locks the obligation's underlying canonical row (Payment/Expense/
 * PurchaseInvoice — whichever ObligationScheduleLine.sourceType names) via
 * the same FOR UPDATE pattern used across Phase 6-9, and reads its current
 * real totalAmount/paidAmount. This is what lets an instrument allocation
 * and a genuinely concurrent real Settlement/SupplierPayment/
 * ExpenseSettlement against the SAME obligation serialize correctly
 * against each other WITHOUT modifying those three functions' own ceiling
 * logic: Postgres blocks any other transaction's write (or FOR UPDATE read)
 * of the same row regardless of which column is involved.
 */
async function lockAndReadObligationCeiling(
  tx: PrismaTransactionClient,
  organizationId: string,
  line: { sourceType: string; paymentId: string | null; expenseId: string | null; purchaseInvoiceId: string | null },
): Promise<{ totalAmount: number; paidAmount: number }> {
  if (line.sourceType === "INVOICE") {
    if (!line.paymentId) throw new ApiValidationError("obligation has no linked Payment.", 500);
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${line.paymentId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const row = await tx.payment.findFirst({ where: { id: line.paymentId, organizationId } });
    if (!row) throw new ApiValidationError("Payment not found.", 404);
    return { totalAmount: Number(row.amount), paidAmount: Number(row.paidAmount) };
  }
  if (line.sourceType === "EXPENSE") {
    if (!line.expenseId) throw new ApiValidationError("obligation has no linked Expense.", 500);
    await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${line.expenseId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const row = await tx.expense.findFirst({ where: { id: line.expenseId, organizationId } });
    if (!row) throw new ApiValidationError("Expense not found.", 404);
    return { totalAmount: Number(row.amount), paidAmount: Number(row.paidAmount) };
  }
  if (!line.purchaseInvoiceId) throw new ApiValidationError("obligation has no linked PurchaseInvoice.", 500);
  await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE id = ${line.purchaseInvoiceId} AND "organizationId" = ${organizationId} FOR UPDATE`;
  const row = await tx.purchaseInvoice.findFirst({ where: { id: line.purchaseInvoiceId, organizationId } });
  if (!row) throw new ApiValidationError("PurchaseInvoice not found.", 404);
  return { totalAmount: Number(row.totalAmount), paidAmount: Number(row.paidAmount) };
}

/**
 * §Obligation integrity. Applying an instrument NEVER touches
 * Payment/Expense/PurchaseInvoice.paidAmount (that stays a pure real-cash
 * cache — "instrument issuance/receipt ile obligation'ın gerçekten
 * cash-settled olması birbirine karıştırılmamalı"); it only records an
 * InstrumentAllocation. Double-ceiling check: (1) the instrument's own face
 * value cannot be over-allocated across obligations, (2) the obligation's
 * total real-cash-paid + net-instrument-allocated cannot exceed its own
 * total — closing the exact cross-channel over-allocation gap between
 * "someone paid cash" and "someone applied a cheque" happening at once.
 */
export async function applyInstrumentToObligation(input: ApplyInstrumentToObligationInput): Promise<ApplyInstrumentToObligationOutcome> {
  assert(input.organizationId, "organizationId");
  assert(input.instrumentId, "instrumentId");
  assert(input.obligationScheduleLineId, "obligationScheduleLineId");
  assertPositiveAmount(input.amount);

  return prisma.$transaction(async (tx) => {
    // Lock the instrument first (deterministic order shared with
    // clearInstrument/bounceInstrument — instrument, then obligation row —
    // so the two can never deadlock against each other).
    await tx.$queryRaw`SELECT id FROM "FinancialInstrument" WHERE id = ${input.instrumentId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;
    const instrument = await findFinancialInstrumentById(input.instrumentId, input.organizationId, tx);
    if (!instrument) throw new ApiValidationError("FinancialInstrument not found.", 404);
    assertAllocatableInstrumentStatus(instrument.status);

    const line = await tx.obligationScheduleLine.findFirst({ where: { id: input.obligationScheduleLineId, organizationId: input.organizationId } });
    if (!line) throw new ApiValidationError("ObligationScheduleLine not found.", 404);
    assertDirectionMatchesObligation(instrument.direction, line.direction);

    const { totalAmount, paidAmount } = await lockAndReadObligationCeiling(tx, input.organizationId, line);
    const netInstrumentOnObligation = await sumNetAllocationsForObligation(line.id, input.organizationId, tx);
    const obligationRemaining = totalAmount - paidAmount - netInstrumentOnObligation;
    if (input.amount > obligationRemaining + AMOUNT_EPSILON) {
      throw new ApiValidationError("amount exceeds the remaining obligation balance (real cash paid + already-allocated instruments considered).", 409);
    }

    const netOnInstrument = await sumNetAllocationsForInstrument(instrument.id, input.organizationId, tx);
    const instrumentRemaining = Number(instrument.amount) - netOnInstrument;
    if (input.amount > instrumentRemaining + AMOUNT_EPSILON) {
      throw new ApiValidationError("amount exceeds the instrument's remaining (unallocated) face value.", 409);
    }

    const allocation = await createInstrumentAllocation(
      { organizationId: input.organizationId, instrumentId: instrument.id, obligationScheduleLineId: line.id, kind: "ORIGINAL", amount: input.amount, currency: instrument.currency, appliedAt: new Date(), actorId: input.actorId },
      tx,
    );

    let updatedInstrument = instrument;
    if (instrument.status === "REGISTERED") {
      await updateInstrumentStatus(instrument.id, input.organizationId, "REGISTERED", "ALLOCATED", {}, tx);
      await recordInstrumentStatusHistory({ organizationId: input.organizationId, instrumentId: instrument.id, fromStatus: "REGISTERED", toStatus: "ALLOCATED", performedById: input.actorId }, tx);
      updatedInstrument = { ...instrument, status: "ALLOCATED" };
    }

    return { instrument: updatedInstrument, allocation };
  });
}

/**
 * §Real cash/bank settlement boundary — the ONLY place an instrument's
 * lifecycle produces a real FinancialAccountMovement, by composing the
 * EXISTING canonical applySettlement/settleExpense/applySupplierPayment
 * (never a parallel money-movement path), one call per active allocation,
 * each within THIS SAME transaction (outerTx) so the instrument's status
 * flip to CLEARED is atomic with the real settlement(s) it produces.
 *
 * paymentMethod here must be a real settlement rail (CASH/BANK_TRANSFER) —
 * assertSupportedSettlementMethod (unchanged, reused) still rejects
 * CHEQUE/PROMISSORY_NOTE as a settlement method, which is exactly correct:
 * once an instrument clears, the money that lands is real cash/bank money,
 * not "more cheque" — the instrument's own identity is preserved via
 * InstrumentAllocation.settledReferenceType/Id, not by mislabeling the
 * settlement's own paymentMethod.
 */
export async function clearInstrument(input: ClearInstrumentInput): Promise<ClearInstrumentOutcome> {
  assert(input.organizationId, "organizationId");
  assert(input.instrumentId, "instrumentId");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "FinancialInstrument" WHERE id = ${input.instrumentId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;
    const instrument = await findFinancialInstrumentById(input.instrumentId, input.organizationId, tx);
    if (!instrument) throw new ApiValidationError("FinancialInstrument not found.", 404);
    assertClearableInstrumentStatus(instrument.status);

    const activeAllocations = await findActiveAllocationsForInstrument(instrument.id, input.organizationId, tx);
    if (activeAllocations.length === 0) {
      throw new ApiValidationError("instrument must be applied to at least one obligation before it can be cleared.", 409);
    }

    try {
      await updateInstrumentStatus(instrument.id, input.organizationId, instrument.status, "CLEARED", {}, tx);
    } catch (error) {
      if (error instanceof InstrumentConcurrentlyModifiedError) {
        throw new ApiValidationError("instrument was concurrently modified; reload and retry.", 409);
      }
      throw error;
    }

    const cleared: ClearedAllocationResult[] = [];
    for (const allocation of activeAllocations) {
      const line = allocation.obligationScheduleLine;
      const idempotencyKey = `instrument-allocation:${allocation.id}`;
      const amount = Number(allocation.amount);

      if (line.sourceType === "INVOICE") {
        if (!line.paymentId) throw new ApiValidationError("obligation has no linked Payment.", 500);
        const outcome = await applySettlement({ organizationId: input.organizationId, paymentId: line.paymentId, amount, paymentMethod: input.paymentMethod, financialAccountReference: input.financialAccountReference, occurredAt: input.occurredAt, idempotencyKey, actorId: input.actorId }, tx);
        if (!outcome) throw new ApiValidationError("Payment not found while clearing instrument.", 404);
        await markInstrumentAllocationSettled(allocation.id, input.organizationId, "SETTLEMENT", outcome.settlement.id, tx);
        cleared.push({ allocationId: allocation.id, obligationScheduleLineId: line.id, settledReferenceType: "SETTLEMENT", settledReferenceId: outcome.settlement.id, movementId: outcome.movement.id });
      } else if (line.sourceType === "EXPENSE") {
        if (!line.expenseId) throw new ApiValidationError("obligation has no linked Expense.", 500);
        const outcome = await settleExpense({ organizationId: input.organizationId, expenseId: line.expenseId, amount, paymentMethod: input.paymentMethod, financialAccountReference: input.financialAccountReference, occurredAt: input.occurredAt, idempotencyKey, actorId: input.actorId }, tx);
        if (!outcome) throw new ApiValidationError("Expense not found while clearing instrument.", 404);
        await markInstrumentAllocationSettled(allocation.id, input.organizationId, "EXPENSE_SETTLEMENT", outcome.settlement.id, tx);
        cleared.push({ allocationId: allocation.id, obligationScheduleLineId: line.id, settledReferenceType: "EXPENSE_SETTLEMENT", settledReferenceId: outcome.settlement.id, movementId: outcome.movement.id });
      } else {
        if (!line.purchaseInvoiceId) throw new ApiValidationError("obligation has no linked PurchaseInvoice.", 500);
        const outcome = await applySupplierPayment({ organizationId: input.organizationId, purchaseInvoiceId: line.purchaseInvoiceId, amount, paymentMethod: input.paymentMethod, financialAccountReference: input.financialAccountReference, occurredAt: input.occurredAt, idempotencyKey, actorId: input.actorId }, tx);
        if (!outcome) throw new ApiValidationError("PurchaseInvoice not found while clearing instrument.", 404);
        await markInstrumentAllocationSettled(allocation.id, input.organizationId, "SUPPLIER_PAYMENT", outcome.settlement.id, tx);
        cleared.push({ allocationId: allocation.id, obligationScheduleLineId: line.id, settledReferenceType: "SUPPLIER_PAYMENT", settledReferenceId: outcome.settlement.id, movementId: outcome.movement.id });
      }
    }

    await recordInstrumentStatusHistory({ organizationId: input.organizationId, instrumentId: instrument.id, fromStatus: instrument.status, toStatus: "CLEARED", performedById: input.actorId }, tx);

    const refreshed = await findFinancialInstrumentById(instrument.id, input.organizationId, tx);
    return { instrument: refreshed!, clearedAllocations: cleared };
  });
}

/**
 * §"Çek karşılıksız çıktı" → the receivable/payable must correctly reopen.
 * Reverses every active allocation (new REVERSAL InstrumentAllocation rows,
 * originals never mutated/deleted — mirrors Settlement/Application's own
 * reversal convention), which makes sumNetAllocationsForObligation drop
 * back down, reopening the obligation for a new instrument or real
 * settlement. Never touches Payment/Expense/PurchaseInvoice.paidAmount —
 * that field was never touched by allocation in the first place, so there
 * is nothing to undo there.
 */
export async function bounceInstrument(input: BounceInstrumentInput): Promise<import("@prisma/client").FinancialInstrument> {
  assert(input.organizationId, "organizationId");
  assert(input.instrumentId, "instrumentId");
  assert(input.reason, "reason");

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "FinancialInstrument" WHERE id = ${input.instrumentId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;
    const instrument = await findFinancialInstrumentById(input.instrumentId, input.organizationId, tx);
    if (!instrument) throw new ApiValidationError("FinancialInstrument not found.", 404);
    assertBounceableInstrumentStatus(instrument.status);

    const activeAllocations = await findActiveAllocationsForInstrument(instrument.id, input.organizationId, tx);
    for (const allocation of activeAllocations) {
      await createInstrumentAllocation(
        { organizationId: input.organizationId, instrumentId: instrument.id, obligationScheduleLineId: allocation.obligationScheduleLineId, kind: "REVERSAL", amount: Number(allocation.amount), currency: allocation.currency, appliedAt: new Date(), actorId: input.actorId, reversalOfId: allocation.id },
        tx,
      );
    }

    try {
      await updateInstrumentStatus(instrument.id, input.organizationId, instrument.status, "BOUNCED", { cancelReason: input.reason }, tx);
    } catch (error) {
      if (error instanceof InstrumentConcurrentlyModifiedError) {
        throw new ApiValidationError("instrument was concurrently modified; reload and retry.", 409);
      }
      throw error;
    }

    await recordInstrumentStatusHistory({ organizationId: input.organizationId, instrumentId: instrument.id, fromStatus: instrument.status, toStatus: "BOUNCED", reason: input.reason, performedById: input.actorId }, tx);

    return (await findFinancialInstrumentById(instrument.id, input.organizationId, tx))!;
  });
}

/**
 * Only a REGISTERED (never applied to any obligation, never settled/
 * bounced) instrument can be cancelled — mirrors payment.void/
 * cancelExpense's own "nothing real has happened yet" restriction exactly.
 */
export async function cancelInstrument(input: CancelInstrumentInput): Promise<import("@prisma/client").FinancialInstrument> {
  assert(input.organizationId, "organizationId");
  assert(input.instrumentId, "instrumentId");
  assert(input.reason, "reason");

  return prisma.$transaction(async (tx) => {
    const instrument = await findFinancialInstrumentById(input.instrumentId, input.organizationId, tx);
    if (!instrument) throw new ApiValidationError("FinancialInstrument not found.", 404);
    assertCancellableInstrumentStatus(instrument.status);

    try {
      await updateInstrumentStatus(instrument.id, input.organizationId, "REGISTERED", "CANCELLED", { cancelReason: input.reason }, tx);
    } catch (error) {
      if (error instanceof InstrumentConcurrentlyModifiedError) {
        throw new ApiValidationError("instrument was concurrently modified; reload and retry.", 409);
      }
      throw error;
    }

    await recordInstrumentStatusHistory({ organizationId: input.organizationId, instrumentId: instrument.id, fromStatus: "REGISTERED", toStatus: "CANCELLED", reason: input.reason, performedById: input.actorId }, tx);

    return (await findFinancialInstrumentById(instrument.id, input.organizationId, tx))!;
  });
}

export async function reverseInstrumentAllocation(input: { organizationId: string; instrumentAllocationId: string; reason: string; actorId: string }): Promise<import("@prisma/client").InstrumentAllocation> {
  assert(input.organizationId, "organizationId");
  assert(input.instrumentAllocationId, "instrumentAllocationId");
  assert(input.reason, "reason");

  return prisma.$transaction(async (tx) => {
    const original = await findInstrumentAllocationForReversal(input.instrumentAllocationId, input.organizationId, tx);
    if (!original) throw new ApiValidationError("InstrumentAllocation not found.", 404);
    if (original.kind === "REVERSAL") throw new ApiValidationError("a reversal cannot itself be reversed.", 409);
    if (original.reversal) throw new ApiValidationError("this allocation has already been reversed.", 409);
    if (original.settledReferenceId) throw new ApiValidationError("this allocation has already been cleared into a real settlement; reverse that settlement instead of this allocation.", 409);

    return createInstrumentAllocation(
      { organizationId: input.organizationId, instrumentId: original.instrumentId, obligationScheduleLineId: original.obligationScheduleLineId, kind: "REVERSAL", amount: Number(original.amount), currency: original.currency, appliedAt: new Date(), actorId: input.actorId, reversalOfId: original.id },
      tx,
    );
  });
}
