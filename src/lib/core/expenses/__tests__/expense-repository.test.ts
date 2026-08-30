import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordExpenseCreatedMock, reverseSourceEntriesMock } = vi.hoisted(() => ({
  recordExpenseCreatedMock: vi.fn(),
  reverseSourceEntriesMock: vi.fn(),
}));

vi.mock("@/lib/accounting/ledger.service", () => ({
  recordExpenseCreated: recordExpenseCreatedMock,
  reverseSourceEntries: reverseSourceEntriesMock,
}));

function baseExpense(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "expense-1", organizationId: "org-1", title: "Ofis kirası", amount: 1000, netAmount: null, taxAmount: null, currency: "TRY", paidAmount: 0, status: "PENDING", expenseDate: new Date("2026-08-01"), ...overrides };
}

function fakeTx() {
  const state = { expense: baseExpense() };
  return {
    expense: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { state.expense = { ...baseExpense(), ...data }; return state.expense; }),
      findFirst: vi.fn(async () => state.expense),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { state.expense = { ...state.expense, ...data }; return state.expense; }),
      updateMany: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { state.expense = { ...state.expense, ...data }; return { count: 1 }; }),
    },
    _state: state,
  };
}

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(fakeTx())) },
}));

import { createExpense, updateExpense, cancelExpense, applyExpenseSettlementAmount, ExpenseConcurrentlyModifiedError } from "../expense-repository";

function fakeCasTx(initialPaidAmount: number) {
  const state = { expense: baseExpense({ paidAmount: initialPaidAmount }) };
  return {
    expense: {
      findFirst: vi.fn(async () => state.expense),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (where.paidAmount !== undefined && where.paidAmount !== state.expense.paidAmount) return { count: 0 };
        state.expense = { ...state.expense, ...data };
        return { count: 1 };
      }),
    },
    _state: state,
  };
}

describe("createExpense", () => {
  beforeEach(() => vi.clearAllMocks());

  it("always creates as PENDING and records the economic recognition entry", async () => {
    const expense = await createExpense({ organizationId: "org-1", title: "Ofis kirası", category: "RENT", amount: 1000, expenseDate: new Date("2026-08-01") });
    expect(expense.status).toBe("PENDING");
    expect(recordExpenseCreatedMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", expenseId: expense.id, amount: 1000 }));
  });

  it("rejects a netAmount/taxAmount breakdown that does not sum to amount", async () => {
    await expect(
      createExpense({ organizationId: "org-1", title: "Ofis kirası", category: "RENT", amount: 1000, netAmount: 800, taxAmount: 100, expenseDate: new Date("2026-08-01") }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("updateExpense", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an amount change once settlement has begun", async () => {
    const tx = fakeTx();
    tx._state.expense = baseExpense({ paidAmount: 400 });
    await expect(updateExpense({ id: "expense-1", organizationId: "org-1", amount: 2000 }, tx as never)).rejects.toMatchObject({ status: 409 });
  });

  it("allows metadata edits once settlement has begun as long as amount/currency are untouched", async () => {
    const tx = fakeTx();
    tx._state.expense = baseExpense({ paidAmount: 400 });
    const updated = await updateExpense({ id: "expense-1", organizationId: "org-1", title: "Yeni başlık" }, tx as never);
    expect(updated.title).toBe("Yeni başlık");
  });

  it("rejects editing a cancelled expense", async () => {
    const tx = fakeTx();
    tx._state.expense = baseExpense({ status: "CANCELLED" });
    await expect(updateExpense({ id: "expense-1", organizationId: "org-1", title: "x" }, tx as never)).rejects.toMatchObject({ status: 409 });
  });
});

describe("cancelExpense", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels a pending expense and reverses its economic recognition", async () => {
    const tx = fakeTx();
    tx._state.expense = baseExpense({ paidAmount: 0 });
    const cancelled = await cancelExpense({ id: "expense-1", organizationId: "org-1", reason: "iptal" }, tx as never);
    expect(cancelled.status).toBe("CANCELLED");
    expect(reverseSourceEntriesMock).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "EXPENSE", sourceId: "expense-1" }));
  });

  it("rejects cancelling an expense with recorded settlements", async () => {
    const tx = fakeTx();
    tx._state.expense = baseExpense({ paidAmount: 400 });
    await expect(cancelExpense({ id: "expense-1", organizationId: "org-1" }, tx as never)).rejects.toMatchObject({ status: 409 });
    expect(reverseSourceEntriesMock).not.toHaveBeenCalled();
  });

  it("is a no-op when already cancelled", async () => {
    const tx = fakeTx();
    tx._state.expense = baseExpense({ status: "CANCELLED" });
    const result = await cancelExpense({ id: "expense-1", organizationId: "org-1" }, tx as never);
    expect(result.status).toBe("CANCELLED");
    expect(reverseSourceEntriesMock).not.toHaveBeenCalled();
  });
});

describe("applyExpenseSettlementAmount — CAS (CONCURRENT CEILING mechanism)", () => {
  it("succeeds when the row still matches expectedPriorPaidAmount", async () => {
    const tx = fakeCasTx(0);
    const updated = await applyExpenseSettlementAmount({ id: "expense-1", organizationId: "org-1", paidAmount: 400, status: "PARTIALLY_PAID", expectedPriorPaidAmount: 0 }, tx as never);
    expect(updated?.paidAmount).toBe(400);
  });

  it("throws ExpenseConcurrentlyModifiedError when the row's paidAmount has already moved on", async () => {
    const tx = fakeCasTx(600); // a concurrent writer already advanced it past what this caller read
    await expect(
      applyExpenseSettlementAmount({ id: "expense-1", organizationId: "org-1", paidAmount: 400, status: "PARTIALLY_PAID", expectedPriorPaidAmount: 0 }, tx as never),
    ).rejects.toBeInstanceOf(ExpenseConcurrentlyModifiedError);
  });

  it("leaves existing callers (no expectedPriorPaidAmount) completely unaffected", async () => {
    const tx = fakeCasTx(999); // any stale value — must not matter without the CAS guard
    const updated = await applyExpenseSettlementAmount({ id: "expense-1", organizationId: "org-1", paidAmount: 400, status: "PARTIALLY_PAID" }, tx as never);
    expect(updated?.paidAmount).toBe(400);
  });
});
