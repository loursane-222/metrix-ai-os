import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  createFinancialInstrumentMock, findFinancialInstrumentByIdMock, updateInstrumentStatusMock, recordInstrumentStatusHistoryMock,
  createInstrumentAllocationMock, findActiveAllocationsForInstrumentMock, sumNetAllocationsForInstrumentMock, sumNetAllocationsForObligationMock,
  markInstrumentAllocationSettledMock, findInstrumentAllocationForReversalMock,
  applySettlementMock, settleExpenseMock, applySupplierPaymentMock,
} = vi.hoisted(() => ({
  createFinancialInstrumentMock: vi.fn(),
  findFinancialInstrumentByIdMock: vi.fn(),
  updateInstrumentStatusMock: vi.fn(),
  recordInstrumentStatusHistoryMock: vi.fn(),
  createInstrumentAllocationMock: vi.fn(),
  findActiveAllocationsForInstrumentMock: vi.fn(),
  sumNetAllocationsForInstrumentMock: vi.fn(),
  sumNetAllocationsForObligationMock: vi.fn(),
  markInstrumentAllocationSettledMock: vi.fn(),
  findInstrumentAllocationForReversalMock: vi.fn(),
  applySettlementMock: vi.fn(),
  settleExpenseMock: vi.fn(),
  applySupplierPaymentMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(currentTx)) },
}));

vi.mock("../financial-instrument.repository", async () => {
  const actual = await vi.importActual<typeof import("../financial-instrument.repository")>("../financial-instrument.repository");
  return {
    ...actual,
    createFinancialInstrument: createFinancialInstrumentMock,
    findFinancialInstrumentById: findFinancialInstrumentByIdMock,
    updateInstrumentStatus: updateInstrumentStatusMock,
    recordInstrumentStatusHistory: recordInstrumentStatusHistoryMock,
    createInstrumentAllocation: createInstrumentAllocationMock,
    findActiveAllocationsForInstrument: findActiveAllocationsForInstrumentMock,
    sumNetAllocationsForInstrument: sumNetAllocationsForInstrumentMock,
    sumNetAllocationsForObligation: sumNetAllocationsForObligationMock,
    markInstrumentAllocationSettled: markInstrumentAllocationSettledMock,
    findInstrumentAllocationForReversal: findInstrumentAllocationForReversalMock,
  };
});

vi.mock("@/lib/core/settlements/settlement.service", () => ({ applySettlement: applySettlementMock }));
vi.mock("@/lib/core/expenses/expense-settlement.service", () => ({ settleExpense: settleExpenseMock }));
vi.mock("@/lib/core/supplier-payments/supplier-payment.service", () => ({ applySupplierPayment: applySupplierPaymentMock }));

import { InstrumentConcurrentlyModifiedError } from "../financial-instrument.repository";
import { applyInstrumentToObligation, bounceInstrument, clearInstrument, registerInstrument } from "../financial-instrument.service";

const ORG = "org-1";

function instrument(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "instrument-1", organizationId: ORG, direction: "RECEIVED", instrumentType: "CHEQUE", amount: 1000, currency: "TRY", status: "REGISTERED", customerId: "cust-1", ...overrides };
}

function obligationLine(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "obligation-1", organizationId: ORG, direction: "RECEIVABLE", sourceType: "INVOICE", paymentId: "payment-1", expenseId: null, purchaseInvoiceId: null, ...overrides };
}

let currentTx: {
  financialInstrument: { findFirst: ReturnType<typeof vi.fn> };
  obligationScheduleLine: { findFirst: ReturnType<typeof vi.fn> };
  payment: { findFirst: ReturnType<typeof vi.fn> };
  expense: { findFirst: ReturnType<typeof vi.fn> };
  purchaseInvoice: { findFirst: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

function setupTx(opts: { payment?: Record<string, unknown> } = {}) {
  currentTx = {
    financialInstrument: { findFirst: vi.fn() },
    obligationScheduleLine: { findFirst: vi.fn() },
    payment: { findFirst: vi.fn().mockResolvedValue({ id: "payment-1", amount: 1000, paidAmount: 0, ...opts.payment }) },
    expense: { findFirst: vi.fn() },
    purchaseInvoice: { findFirst: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return currentTx;
}

describe("registerInstrument — §core semantic invariant: receipt/issuance never moves money", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createFinancialInstrumentMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "instrument-1", status: "REGISTERED", ...input }));
  });

  it("'Müşteriden çek aldım': registering a RECEIVED instrument creates no Settlement/FinancialAccountMovement", async () => {
    await registerInstrument({ organizationId: ORG, instrumentType: "CHEQUE", direction: "RECEIVED", customerId: "cust-1", amount: 1000, maturityDate: new Date("2026-12-01"), actorId: "actor-1" });

    expect(applySettlementMock).not.toHaveBeenCalled();
    expect(settleExpenseMock).not.toHaveBeenCalled();
    expect(applySupplierPaymentMock).not.toHaveBeenCalled();
    expect(createFinancialInstrumentMock).toHaveBeenCalledTimes(1);
  });

  it("'Tedarikçiye çek verdim': registering an ISSUED instrument creates no immediate bank outflow", async () => {
    await registerInstrument({ organizationId: ORG, instrumentType: "CHEQUE", direction: "ISSUED", supplierId: "supplier-1", amount: 1000, maturityDate: new Date("2026-12-01"), actorId: "actor-1" });

    expect(applySettlementMock).not.toHaveBeenCalled();
    expect(settleExpenseMock).not.toHaveBeenCalled();
    expect(applySupplierPaymentMock).not.toHaveBeenCalled();
  });

  it("requires a customerId for RECEIVED and a supplierId for ISSUED", async () => {
    await expect(registerInstrument({ organizationId: ORG, instrumentType: "CHEQUE", direction: "RECEIVED", amount: 1000, maturityDate: new Date(), actorId: "a" })).rejects.toMatchObject({ status: 400 });
    await expect(registerInstrument({ organizationId: ORG, instrumentType: "CHEQUE", direction: "ISSUED", amount: 1000, maturityDate: new Date(), actorId: "a" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("applyInstrumentToObligation — direction matching + double ceiling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createInstrumentAllocationMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "allocation-1", ...input }));
    sumNetAllocationsForObligationMock.mockResolvedValue(0);
    sumNetAllocationsForInstrumentMock.mockResolvedValue(0);
  });

  it("rejects applying a RECEIVED instrument to a PAYABLE obligation", async () => {
    const tx = setupTx();
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument({ direction: "RECEIVED" }));
    tx.obligationScheduleLine.findFirst.mockResolvedValue(obligationLine({ direction: "PAYABLE" }));

    await expect(applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 100, actorId: "a" })).rejects.toThrow(/received instrument can only be applied to a receivable/);
  });

  it("rejects applying an ISSUED instrument to a RECEIVABLE obligation", async () => {
    const tx = setupTx();
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument({ direction: "ISSUED" }));
    tx.obligationScheduleLine.findFirst.mockResolvedValue(obligationLine({ direction: "RECEIVABLE" }));

    await expect(applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 100, actorId: "a" })).rejects.toThrow(/issued instrument can only be applied to a payable/);
  });

  it("rejects an allocation exceeding the instrument's own remaining face value", async () => {
    const tx = setupTx();
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument({ amount: 500 }));
    tx.obligationScheduleLine.findFirst.mockResolvedValue(obligationLine());
    sumNetAllocationsForInstrumentMock.mockResolvedValue(400); // 400 of 500 already allocated elsewhere

    await expect(applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 200, actorId: "a" })).rejects.toThrow(/instrument's remaining/);
  });

  it("rejects an allocation exceeding the obligation's remaining balance, accounting for real paidAmount already there", async () => {
    const tx = setupTx({ payment: { amount: 1000, paidAmount: 700 } }); // 700 already paid in real cash
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument());
    tx.obligationScheduleLine.findFirst.mockResolvedValue(obligationLine());

    await expect(applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 400, actorId: "a" })).rejects.toThrow(/remaining obligation balance/);
  });

  it("rejects an allocation exceeding the obligation's remaining balance when another instrument already covers part of it", async () => {
    const tx = setupTx({ payment: { amount: 1000, paidAmount: 0 } });
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument());
    tx.obligationScheduleLine.findFirst.mockResolvedValue(obligationLine());
    sumNetAllocationsForObligationMock.mockResolvedValue(600); // a different cheque already covers 600

    await expect(applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 500, actorId: "a" })).rejects.toThrow(/remaining obligation balance/);
  });

  it("does not touch Payment.paidAmount when allocating — obligation.paidAmount stays a pure real-cash cache", async () => {
    const tx = setupTx();
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument());
    tx.obligationScheduleLine.findFirst.mockResolvedValue(obligationLine());

    await applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 500, actorId: "a" });

    // No repository write to Payment happened — only a SELECT FOR UPDATE
    // read via $queryRaw and a plain findFirst; payment.update was never
    // called because there is no update mock at all in this fake tx.
    expect(createInstrumentAllocationMock).toHaveBeenCalledWith(expect.objectContaining({ amount: 500, kind: "ORIGINAL" }), tx);
  });

  it("transitions REGISTERED to ALLOCATED on first application", async () => {
    setupTx();
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument({ status: "REGISTERED" }));
    currentTx.obligationScheduleLine.findFirst.mockResolvedValue(obligationLine());

    const result = await applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 100, actorId: "a" });

    expect(updateInstrumentStatusMock).toHaveBeenCalledWith("instrument-1", ORG, "REGISTERED", "ALLOCATED", {}, currentTx);
    expect(result.instrument.status).toBe("ALLOCATED");
  });
});

describe("clearInstrument — composes existing Settlement/SupplierPayment/ExpenseSettlement authority, never a parallel path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findActiveAllocationsForInstrumentMock.mockResolvedValue([
      { id: "allocation-1", amount: 500, obligationScheduleLineId: "obligation-1", obligationScheduleLine: obligationLine() },
    ]);
    applySettlementMock.mockResolvedValue({ settlement: { id: "settlement-1" }, movement: { id: "movement-1" } });
  });

  it("calls applySettlement with the SAME outer transaction and a deterministic per-allocation idempotencyKey", async () => {
    const tx = setupTx();
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument({ status: "ALLOCATED" }));

    await clearInstrument({ organizationId: ORG, instrumentId: "instrument-1", paymentMethod: "BANK_TRANSFER", financialAccountReference: "account-1", actorId: "a" });

    expect(applySettlementMock).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "payment-1", amount: 500, paymentMethod: "BANK_TRANSFER", idempotencyKey: "instrument-allocation:allocation-1" }),
      tx,
    );
  });

  it("rejects clearing an instrument with zero active allocations", async () => {
    setupTx();
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument({ status: "REGISTERED" }));
    findActiveAllocationsForInstrumentMock.mockResolvedValue([]);

    await expect(clearInstrument({ organizationId: ORG, instrumentId: "instrument-1", paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "a" })).rejects.toThrow(/applied to at least one obligation/);
    expect(applySettlementMock).not.toHaveBeenCalled();
  });

  it("rejects clearing an already-CLEARED instrument (prevents duplicate financial effect)", async () => {
    setupTx();
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument({ status: "CLEARED" }));

    await expect(clearInstrument({ organizationId: ORG, instrumentId: "instrument-1", paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "a" })).rejects.toThrow(/cannot be cleared/);
    expect(applySettlementMock).not.toHaveBeenCalled();
  });

  it("CONCURRENT: two simultaneous clear attempts on the same instrument — only one produces real money movement", async () => {
    setupTx();
    let currentStatus = "ALLOCATED";
    findFinancialInstrumentByIdMock.mockImplementation(async () => instrument({ status: currentStatus }));
    updateInstrumentStatusMock.mockImplementation(async (id, org, fromStatus) => {
      if (fromStatus !== currentStatus) throw new InstrumentConcurrentlyModifiedError(id);
      currentStatus = "CLEARED";
      return { count: 1 };
    });

    const attempt = () => clearInstrument({ organizationId: ORG, instrumentId: "instrument-1", paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "a" });
    const [a, b] = await Promise.allSettled([attempt(), attempt()]);

    const settled = [a, b];
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(applySettlementMock).toHaveBeenCalledTimes(1); // real money moved exactly once
  });
});

describe("bounceInstrument — §'çek karşılıksız çıktı': reopens the obligation correctly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createInstrumentAllocationMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "reversal-1", ...input }));
    updateInstrumentStatusMock.mockResolvedValue({ count: 1 });
  });

  it("creates a REVERSAL allocation for every active allocation and marks the instrument BOUNCED", async () => {
    setupTx();
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument({ status: "ALLOCATED" }));
    findActiveAllocationsForInstrumentMock.mockResolvedValue([{ id: "allocation-1", amount: 500, currency: "TRY", obligationScheduleLineId: "obligation-1" }]);

    await bounceInstrument({ organizationId: ORG, instrumentId: "instrument-1", reason: "karşılıksız", actorId: "a" });

    expect(createInstrumentAllocationMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "REVERSAL", amount: 500, reversalOfId: "allocation-1" }), currentTx);
    expect(updateInstrumentStatusMock).toHaveBeenCalledWith("instrument-1", ORG, "ALLOCATED", "BOUNCED", { cancelReason: "karşılıksız" }, currentTx);
  });

  it("after bouncing, sumNetAllocationsForObligation would reflect the reversal — obligation is not left wrongly closed", async () => {
    // This test proves the MECHANISM (a REVERSAL row is created that
    // sumNetAllocationsForObligation nets against the ORIGINAL) rather than
    // re-deriving the sum function itself (covered by its own repository).
    setupTx();
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument({ status: "ALLOCATED" }));
    findActiveAllocationsForInstrumentMock.mockResolvedValue([{ id: "allocation-1", amount: 500, currency: "TRY", obligationScheduleLineId: "obligation-1" }]);

    await bounceInstrument({ organizationId: ORG, instrumentId: "instrument-1", reason: "karşılıksız", actorId: "a" });

    const reversalCall = createInstrumentAllocationMock.mock.calls[0]![0];
    expect(reversalCall.obligationScheduleLineId).toBe("obligation-1");
    expect(reversalCall.kind).toBe("REVERSAL");
  });

  it("rejects bouncing an already-CLEARED instrument — real settled cash must be reversed via Settlement, not instrument status", async () => {
    setupTx();
    findFinancialInstrumentByIdMock.mockResolvedValue(instrument({ status: "CLEARED" }));
    await expect(bounceInstrument({ organizationId: ORG, instrumentId: "instrument-1", reason: "test", actorId: "a" })).rejects.toThrow(/cannot be marked bounced/);
  });
});
