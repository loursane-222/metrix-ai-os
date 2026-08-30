import { describe, expect, it, vi, beforeEach } from "vitest";

// This file deliberately does NOT mock financial-instrument.repository.ts —
// it exercises the REAL sumNetAllocationsForObligation / sumNetAllocationsForInstrument /
// findActiveAllocationsForInstrument / createInstrumentAllocation /
// markInstrumentAllocationSettled against an in-memory fake Prisma tx, so
// the exact aggregate-query behavior (not a mocked stand-in for it) is what
// gets proven. Only the three cross-domain settlement authorities and the
// Payment/Obligation reads are faked, mirroring how a real settlement
// updates paidAmount.

const { applySettlementMock } = vi.hoisted(() => ({ applySettlementMock: vi.fn() }));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(fakeTx)) },
}));
vi.mock("@/lib/core/settlements/settlement.service", () => ({ applySettlement: applySettlementMock }));
vi.mock("@/lib/core/expenses/expense-settlement.service", () => ({ settleExpense: vi.fn() }));
vi.mock("@/lib/core/supplier-payments/supplier-payment.service", () => ({ applySupplierPayment: vi.fn() }));

import { applyInstrumentToObligation, clearInstrument } from "../financial-instrument.service";
import { sumNetAllocationsForInstrument, sumNetAllocationsForObligation } from "../financial-instrument.repository";

type AllocationRow = {
  id: string;
  organizationId: string;
  instrumentId: string;
  obligationScheduleLineId: string;
  kind: "ORIGINAL" | "REVERSAL";
  amount: number;
  currency: string;
  appliedAt: Date;
  actorId: string;
  reversalOfId?: string | null;
  settledReferenceType?: string | null;
  settledReferenceId?: string | null;
};

const ORG = "org-1";
let allocations: AllocationRow[];
let nextAllocationId: number;
let instrumentRow: { id: string; organizationId: string; amount: number; currency: string; direction: string; status: string };
let paymentRow: { id: string; amount: number; paidAmount: number };
let obligationLineRow: { id: string; organizationId: string; direction: string; sourceType: string; paymentId: string | null; expenseId: string | null; purchaseInvoiceId: string | null };

function sumAmount(rows: AllocationRow[]): number {
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

const fakeTx = {
  $queryRaw: vi.fn().mockResolvedValue([]),
  financialInstrument: {
    findFirst: vi.fn(() => Promise.resolve({ ...instrumentRow })),
    updateMany: vi.fn(({ where, data }: { where: { status: string }; data: { status: string } }) => {
      if (instrumentRow.status !== where.status) return Promise.resolve({ count: 0 });
      instrumentRow = { ...instrumentRow, status: data.status };
      return Promise.resolve({ count: 1 });
    }),
  },
  obligationScheduleLine: {
    findFirst: vi.fn(() => Promise.resolve({ ...obligationLineRow })),
  },
  payment: {
    findFirst: vi.fn(() => Promise.resolve({ ...paymentRow })),
  },
  instrumentStatusHistory: { create: vi.fn().mockResolvedValue({}) },
  instrumentAllocation: {
    create: vi.fn(({ data }: { data: Omit<AllocationRow, "id"> }) => {
      const row: AllocationRow = { id: `allocation-${nextAllocationId++}`, ...data };
      allocations.push(row);
      return Promise.resolve({ ...row });
    }),
    updateMany: vi.fn(({ where, data }: { where: { id: string; organizationId: string }; data: Partial<AllocationRow> }) => {
      const row = allocations.find((a) => a.id === where.id && a.organizationId === where.organizationId);
      if (!row) return Promise.resolve({ count: 0 });
      Object.assign(row, data);
      return Promise.resolve({ count: 1 });
    }),
    findMany: vi.fn(({ where }: { where: { instrumentId?: string; obligationScheduleLineId?: string; organizationId: string; kind: string; reversal?: null } }) => {
      const matches = allocations.filter((a) =>
        a.organizationId === where.organizationId &&
        a.kind === where.kind &&
        (where.instrumentId === undefined || a.instrumentId === where.instrumentId) &&
        (where.obligationScheduleLineId === undefined || a.obligationScheduleLineId === where.obligationScheduleLineId) &&
        // "reversal: null" means: no other row's reversalOfId points at this one
        (where.reversal === undefined || !allocations.some((other) => other.reversalOfId === a.id)),
      );
      return Promise.resolve(matches.map((row) => ({ ...row, obligationScheduleLine: { ...obligationLineRow } })));
    }),
    aggregate: vi.fn(({ where }: { where: { instrumentId?: string; obligationScheduleLineId?: string; organizationId: string; kind: "ORIGINAL" | "REVERSAL"; settledReferenceId?: null } }) => {
      const matches = allocations.filter((a) =>
        a.organizationId === where.organizationId &&
        a.kind === where.kind &&
        (where.instrumentId === undefined || a.instrumentId === where.instrumentId) &&
        (where.obligationScheduleLineId === undefined || a.obligationScheduleLineId === where.obligationScheduleLineId) &&
        (where.settledReferenceId === undefined || a.settledReferenceId == null),
      );
      return Promise.resolve({ _sum: { amount: matches.length ? sumAmount(matches) : null } });
    }),
  },
};

function resetWorld() {
  allocations = [];
  nextAllocationId = 1;
  instrumentRow = { id: "instrument-1", organizationId: ORG, amount: 100, currency: "TRY", direction: "RECEIVED", status: "REGISTERED" };
  paymentRow = { id: "payment-1", amount: 100, paidAmount: 0 };
  obligationLineRow = { id: "obligation-1", organizationId: ORG, direction: "RECEIVABLE", sourceType: "INVOICE", paymentId: "payment-1", expenseId: null, purchaseInvoiceId: null };
}

describe("§Phase 10 final integrity check: instrument allocation coverage vs real cash settlement never double-count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorld();
    applySettlementMock.mockImplementation(async (input: { amount: number }) => {
      paymentRow = { ...paymentRow, paidAmount: paymentRow.paidAmount + input.amount };
      return { settlement: { id: "settlement-1" }, movement: { id: "movement-1" } };
    });
  });

  it("SCENARIO 1 — 100 obligation + 100 instrument allocation + clear 100 → final coverage exactly 100, never 200", async () => {
    await applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 100, actorId: "a" });
    await clearInstrument({ organizationId: ORG, instrumentId: "instrument-1", paymentMethod: "BANK_TRANSFER", financialAccountReference: "account-1", actorId: "a" });

    // Canonical reality after clearing:
    expect(paymentRow.paidAmount).toBe(100); // cash/bank settled = 100

    const unsettledCoverage = await sumNetAllocationsForObligation("obligation-1", ORG, fakeTx as never);
    expect(unsettledCoverage).toBe(0); // active unsettled instrument coverage = 0

    const totalCoverage = paymentRow.paidAmount + unsettledCoverage;
    expect(totalCoverage).toBe(100); // total obligation coverage = 100, NOT 200

    // applySettlement was called exactly once — exactly one real settlement, one movement.
    expect(applySettlementMock).toHaveBeenCalledTimes(1);
  });

  it("SCENARIO 2 — 100 obligation + cash 40 (pre-existing) + instrument 60 + clear → exactly 100, not 140 and not 160", async () => {
    paymentRow.paidAmount = 40; // real cash already collected before any instrument involved

    await applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 60, actorId: "a" });
    // instrument amount 100 but only 60 is allocated to this obligation (partial allocation of the instrument's face value)
    await clearInstrument({ organizationId: ORG, instrumentId: "instrument-1", paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "a" });

    expect(paymentRow.paidAmount).toBe(100); // 40 + 60 = 100

    const unsettledCoverage = await sumNetAllocationsForObligation("obligation-1", ORG, fakeTx as never);
    expect(unsettledCoverage).toBe(0);

    expect(paymentRow.paidAmount + unsettledCoverage).toBe(100);
  });

  it("PARTIAL ALLOCATION: instrument's face value (100) only partially allocated (60) — instrument-remaining ceiling still reflects the true, permanently-spent 60 after clearing", async () => {
    await applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 60, actorId: "a" });
    await clearInstrument({ organizationId: ORG, instrumentId: "instrument-1", paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "a" });

    // sumNetAllocationsForInstrument (the instrument's OWN face-value ceiling)
    // intentionally still counts the cleared allocation — that portion of
    // the cheque's face value is permanently spent, not reusable.
    const instrumentSpent = await sumNetAllocationsForInstrument("instrument-1", ORG, fakeTx as never);
    expect(instrumentSpent).toBe(60);

    // The instrument itself is now CLEARED (all currently-active allocations
    // were settled together) so a second allocation attempt is structurally
    // rejected regardless of face-value math.
    await expect(applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 10, actorId: "a" })).rejects.toThrow(/cannot be allocated/);
  });

  it("SETTLEMENT REVERSAL AFTER CLEAR: reversing the underlying Settlement drops paidAmount back down; the (still-excluded) cleared allocation does not resurrect as double coverage", async () => {
    await applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 100, actorId: "a" });
    await clearInstrument({ organizationId: ORG, instrumentId: "instrument-1", paymentMethod: "BANK_TRANSFER", financialAccountReference: "account-1", actorId: "a" });
    expect(paymentRow.paidAmount).toBe(100);

    // Simulate settlement.reverseSettlement's own, unchanged, already-proven
    // effect: it recomputes Payment.paidAmount from SUM(ORIGINAL)-SUM(REVERSAL)
    // Applications (Phase 3 authority, untouched by this fix) — paidAmount
    // drops back to 0.
    paymentRow = { ...paymentRow, paidAmount: 0 };

    const unsettledCoverage = await sumNetAllocationsForObligation("obligation-1", ORG, fakeTx as never);
    // The InstrumentAllocation row still carries settledReferenceId (pointing
    // at the now-reversed settlement) so it correctly stays EXCLUDED here —
    // it does NOT spring back to life as "0 + 100 unsettled = still covered".
    expect(unsettledCoverage).toBe(0);

    // Canonical numeric coverage after the reversal correctly reflects
    // reality: nothing is currently covering this obligation (paidAmount=0,
    // unsettled instrument coverage=0) — matching that the cash that came in
    // was subsequently reversed out. No double-count, no phantom coverage.
    expect(paymentRow.paidAmount + unsettledCoverage).toBe(0);
  });

  it("no duplicate FinancialAccountMovement: clearing an instrument with one active allocation calls applySettlement exactly once", async () => {
    await applyInstrumentToObligation({ organizationId: ORG, instrumentId: "instrument-1", obligationScheduleLineId: "obligation-1", amount: 100, actorId: "a" });
    await clearInstrument({ organizationId: ORG, instrumentId: "instrument-1", paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "a" });

    expect(applySettlementMock).toHaveBeenCalledTimes(1);
    const allocation = allocations[0]!;
    expect(allocation.settledReferenceType).toBe("SETTLEMENT");
    expect(allocation.settledReferenceId).toBe("settlement-1");
  });
});
