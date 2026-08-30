import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const {
  findExpenseByIdForOrganizationMock,
  applyExpenseSettlementAmountMock,
  recordExpenseSettlementApplicationMock,
  reverseSourceEntriesMock,
  listFinancialAccountsMock,
  resolveFinancialAccountMock,
  assertMethodAccountCompatibilityMock,
  assertTransactionCurrencyMatchesAccountMock,
  createExpenseSettlementMock,
  createExpenseSettlementMovementMock,
  findExpenseSettlementByIdempotencyKeyMock,
  findExpenseSettlementByReversalOfIdMock,
  findExpenseSettlementForReversalMock,
  sumNetExpenseSettlementsMock,
  movementFindFirstMock,
} = vi.hoisted(() => ({
  findExpenseByIdForOrganizationMock: vi.fn(),
  applyExpenseSettlementAmountMock: vi.fn(),
  recordExpenseSettlementApplicationMock: vi.fn(),
  reverseSourceEntriesMock: vi.fn(),
  listFinancialAccountsMock: vi.fn(),
  resolveFinancialAccountMock: vi.fn(),
  assertMethodAccountCompatibilityMock: vi.fn(),
  assertTransactionCurrencyMatchesAccountMock: vi.fn(),
  createExpenseSettlementMock: vi.fn(),
  createExpenseSettlementMovementMock: vi.fn(),
  findExpenseSettlementByIdempotencyKeyMock: vi.fn(),
  findExpenseSettlementByReversalOfIdMock: vi.fn(),
  findExpenseSettlementForReversalMock: vi.fn(),
  sumNetExpenseSettlementsMock: vi.fn(),
  movementFindFirstMock: vi.fn(),
}));

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.8.0" });
}

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
    financialAccountMovement: { findFirst: movementFindFirstMock },
  },
}));

vi.mock("@/lib/core/expenses/expense-repository", async () => {
  const actual = await vi.importActual<typeof import("../expense-repository")>("../expense-repository");
  return {
    ExpenseConcurrentlyModifiedError: actual.ExpenseConcurrentlyModifiedError,
    findExpenseByIdForOrganization: findExpenseByIdForOrganizationMock,
    applyExpenseSettlementAmount: applyExpenseSettlementAmountMock,
  };
});

vi.mock("@/lib/accounting/ledger.service", () => ({
  recordExpenseSettlementApplication: recordExpenseSettlementApplicationMock,
  reverseSourceEntries: reverseSourceEntriesMock,
}));

vi.mock("@/lib/financial-accounts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/financial-accounts")>("@/lib/financial-accounts");
  return {
    ...actual,
    listFinancialAccounts: listFinancialAccountsMock,
    resolveFinancialAccount: resolveFinancialAccountMock,
    assertMethodAccountCompatibility: assertMethodAccountCompatibilityMock,
    assertTransactionCurrencyMatchesAccount: assertTransactionCurrencyMatchesAccountMock,
  };
});

vi.mock("../expense-settlement.repository", () => ({
  createExpenseSettlement: createExpenseSettlementMock,
  createExpenseSettlementMovement: createExpenseSettlementMovementMock,
  findExpenseSettlementByIdempotencyKey: findExpenseSettlementByIdempotencyKeyMock,
  findExpenseSettlementByReversalOfId: findExpenseSettlementByReversalOfIdMock,
  findExpenseSettlementForReversal: findExpenseSettlementForReversalMock,
  sumNetExpenseSettlements: sumNetExpenseSettlementsMock,
}));

import { settleExpense, reverseExpenseSettlement } from "../expense-settlement.service";

const ORG = "org-1";
const ACCOUNT = { id: "account-1", organizationId: ORG, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY", status: "ACTIVE" };

function expense(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "expense-1", organizationId: ORG, title: "Ofis kirası", amount: 1000, paidAmount: 0, currency: "TRY", status: "PENDING", ...overrides };
}

describe("settleExpense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFinancialAccountsMock.mockResolvedValue([ACCOUNT]);
    resolveFinancialAccountMock.mockReturnValue({ kind: "RESOLVED", account: ACCOUNT });
    assertMethodAccountCompatibilityMock.mockReturnValue(undefined);
    assertTransactionCurrencyMatchesAccountMock.mockReturnValue(undefined);
    createExpenseSettlementMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "expense-settlement-1", ...input }));
    createExpenseSettlementMovementMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "movement-1", ...input }));
    applyExpenseSettlementAmountMock.mockImplementation(async (input: { paidAmount: number; status: string }) => expense({ paidAmount: input.paidAmount, status: input.status }));
    findExpenseSettlementByIdempotencyKeyMock.mockResolvedValue(null);
  });

  it("rejects an amount exceeding the remaining expense balance", async () => {
    findExpenseByIdForOrganizationMock.mockResolvedValue(expense({ paidAmount: 900 }));
    await expect(
      settleExpense({ organizationId: ORG, expenseId: "expense-1", amount: 200, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(createExpenseSettlementMock).not.toHaveBeenCalled();
  });

  it("rejects settling a cancelled expense", async () => {
    findExpenseByIdForOrganizationMock.mockResolvedValue(expense({ status: "CANCELLED" }));
    await expect(
      settleExpense({ organizationId: ORG, expenseId: "expense-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("fails closed on an unsupported settlement method before resolving any account", async () => {
    findExpenseByIdForOrganizationMock.mockResolvedValue(expense());
    await expect(
      settleExpense({ organizationId: ORG, expenseId: "expense-1", amount: 100, paymentMethod: "CHEQUE" as never, financialAccountReference: "account-1", actorId: "actor-1" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(listFinancialAccountsMock).not.toHaveBeenCalled();
  });

  it("records two partial settlements as two distinct incremental ledger postings and lands on PAID only once fully covered", async () => {
    findExpenseByIdForOrganizationMock.mockResolvedValueOnce(expense({ paidAmount: 0 }));
    await settleExpense({ organizationId: ORG, expenseId: "expense-1", amount: 400, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" });

    findExpenseByIdForOrganizationMock.mockResolvedValueOnce(expense({ paidAmount: 400 }));
    await settleExpense({ organizationId: ORG, expenseId: "expense-1", amount: 600, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" });

    expect(recordExpenseSettlementApplicationMock).toHaveBeenCalledTimes(2);
    expect(recordExpenseSettlementApplicationMock.mock.calls[0]![0]).toMatchObject({ amount: 400 });
    expect(recordExpenseSettlementApplicationMock.mock.calls[1]![0]).toMatchObject({ amount: 600 });
    expect(applyExpenseSettlementAmountMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ paidAmount: 400, status: "PARTIALLY_PAID" }), expect.anything());
    expect(applyExpenseSettlementAmountMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ paidAmount: 1000, status: "PAID" }), expect.anything());
  });

  it("creates the movement with direction OUT — a payable, not a receivable", async () => {
    findExpenseByIdForOrganizationMock.mockResolvedValue(expense());
    await settleExpense({ organizationId: ORG, expenseId: "expense-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" });
    expect(createExpenseSettlementMovementMock).toHaveBeenCalledWith(expect.objectContaining({ direction: "OUT" }), expect.anything());
  });

  describe("IDEMPOTENCY", () => {
    it("replays an existing settlement on idempotency-key match without creating a new one", async () => {
      findExpenseByIdForOrganizationMock.mockResolvedValue(expense({ paidAmount: 400 }));
      movementFindFirstMock.mockResolvedValue({ id: "movement-1" });

      const original = await settleExpense({
        organizationId: ORG, expenseId: "expense-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1",
        occurredAt: new Date("2026-08-30T00:00:00.000Z"), idempotencyKey: "key-1", actorId: "actor-1",
      });
      const storedHash = createExpenseSettlementMock.mock.calls[0]![0].requestHash;

      findExpenseSettlementByIdempotencyKeyMock.mockResolvedValue({ id: "expense-settlement-1", currency: "TRY", requestHash: storedHash });
      createExpenseSettlementMock.mockClear();
      const replay = await settleExpense({
        organizationId: ORG, expenseId: "expense-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1",
        occurredAt: new Date("2026-08-30T00:00:00.000Z"), idempotencyKey: "key-1", actorId: "actor-1",
      });

      expect(original?.replayed).toBe(false);
      expect(replay?.replayed).toBe(true);
      expect(createExpenseSettlementMock).not.toHaveBeenCalled();
    });

    it("replays correctly even when neither call passes occurredAt (regression: the hash must not depend on server-side defaulting)", async () => {
      findExpenseByIdForOrganizationMock.mockResolvedValue(expense({ paidAmount: 400 }));
      movementFindFirstMock.mockResolvedValue({ id: "movement-1" });

      const original = await settleExpense({ organizationId: ORG, expenseId: "expense-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", idempotencyKey: "key-1", actorId: "actor-1" });
      const storedHash = createExpenseSettlementMock.mock.calls[0]![0].requestHash;

      findExpenseSettlementByIdempotencyKeyMock.mockResolvedValue({ id: "expense-settlement-1", currency: "TRY", requestHash: storedHash });
      createExpenseSettlementMock.mockClear();
      const replay = await settleExpense({ organizationId: ORG, expenseId: "expense-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", idempotencyKey: "key-1", actorId: "actor-1" });

      expect(original?.replayed).toBe(false);
      expect(replay?.replayed).toBe(true);
      expect(createExpenseSettlementMock).not.toHaveBeenCalled();
    });

    it("rejects a replay attempt whose payload no longer matches the stored request hash", async () => {
      findExpenseByIdForOrganizationMock.mockResolvedValue(expense({ paidAmount: 400 }));
      findExpenseSettlementByIdempotencyKeyMock.mockResolvedValue({ id: "expense-settlement-1", currency: "TRY", requestHash: "a-different-hash" });
      await expect(
        settleExpense({ organizationId: ORG, expenseId: "expense-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", idempotencyKey: "key-1", actorId: "actor-1" }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("CONCURRENT: two simultaneous requests with the same idempotencyKey produce exactly one committed ExpenseSettlement — the loser replays it", async () => {
      findExpenseByIdForOrganizationMock.mockResolvedValue(expense({ paidAmount: 0 }));
      movementFindFirstMock.mockResolvedValue({ id: "movement-1" });
      findExpenseSettlementByIdempotencyKeyMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      let committed: Record<string, unknown> | null = null;
      createExpenseSettlementMock.mockImplementation(async (input: Record<string, unknown>) => {
        if (committed) throw p2002(); // models Postgres blocking then rejecting the second concurrent INSERT
        committed = { id: "expense-settlement-1", ...input };
        return committed;
      });
      findExpenseSettlementByIdempotencyKeyMock.mockImplementation(async () => committed as never);

      const attempt = () =>
        settleExpense({
          organizationId: ORG, expenseId: "expense-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1",
          occurredAt: new Date("2026-08-30T00:00:00.000Z"), idempotencyKey: "key-1", actorId: "actor-1",
        });

      const [outcomeA, outcomeB] = await Promise.all([attempt(), attempt()]);
      const outcomes = [outcomeA, outcomeB];

      expect(outcomes.filter((outcome) => outcome?.replayed === false)).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome?.replayed === true)).toHaveLength(1);
      expect(outcomeA?.settlement.id).toBe(outcomeB?.settlement.id);
      expect(createExpenseSettlementMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("CONCURRENT CEILING", () => {
    it("re-evaluates the remaining balance against fresh state after a concurrent-modification conflict, rejecting a now-invalid retry instead of blindly retrying the stale amount", async () => {
      findExpenseByIdForOrganizationMock
        .mockResolvedValueOnce(expense({ paidAmount: 0 }))
        .mockResolvedValueOnce(expense({ paidAmount: 0 }))
        .mockResolvedValueOnce(expense({ paidAmount: 600 }));

      applyExpenseSettlementAmountMock
        .mockImplementationOnce(async (input: { paidAmount: number; status: string }) => expense({ paidAmount: input.paidAmount, status: input.status }))
        .mockImplementationOnce(async () => {
          const { ExpenseConcurrentlyModifiedError } = await import("@/lib/core/expenses/expense-repository");
          throw new ExpenseConcurrentlyModifiedError("expense-1");
        });

      const attempt = () =>
        settleExpense({ organizationId: ORG, expenseId: "expense-1", amount: 600, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" });

      const [winner, loser] = await Promise.allSettled([attempt(), attempt()]);

      expect(winner.status).toBe("fulfilled");
      expect(loser.status).toBe("rejected");
      if (loser.status === "rejected") expect(loser.reason).toMatchObject({ status: 409 });
      expect(applyExpenseSettlementAmountMock).toHaveBeenCalledTimes(2);
    });

    it("gives up with a clear 409 after exhausting the concurrent-modification retry budget", async () => {
      findExpenseByIdForOrganizationMock.mockResolvedValue(expense({ paidAmount: 0 }));
      const { ExpenseConcurrentlyModifiedError } = await import("@/lib/core/expenses/expense-repository");
      applyExpenseSettlementAmountMock.mockImplementation(async () => {
        throw new ExpenseConcurrentlyModifiedError("expense-1");
      });
      await expect(
        settleExpense({ organizationId: ORG, expenseId: "expense-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" }),
      ).rejects.toMatchObject({ status: 409 });
      expect(applyExpenseSettlementAmountMock).toHaveBeenCalledTimes(5);
    });
  });
});

describe("reverseExpenseSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createExpenseSettlementMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "reversal-settlement-1", ...input }));
    createExpenseSettlementMovementMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "reversal-movement-1", ...input }));
  });

  it("reverses an expense settlement and moves the expense back from PAID to PARTIALLY_PAID", async () => {
    findExpenseSettlementForReversalMock.mockResolvedValue({
      id: "expense-settlement-1", kind: "ORIGINAL", expenseId: "expense-1", amount: 1000, currency: "TRY", paymentMethod: "CASH", financialAccountId: "account-1",
      movement: { id: "movement-1" }, reversal: null,
    });
    sumNetExpenseSettlementsMock.mockResolvedValue(400);
    findExpenseByIdForOrganizationMock.mockResolvedValue(expense({ paidAmount: 1000, status: "PAID" }));
    applyExpenseSettlementAmountMock.mockResolvedValue(expense({ paidAmount: 400, status: "PARTIALLY_PAID" }));

    const outcome = await reverseExpenseSettlement({ organizationId: ORG, expenseSettlementId: "expense-settlement-1", reason: "yanlış tutar", actorId: "actor-1" });

    expect(outcome?.expense.status).toBe("PARTIALLY_PAID");
    expect(reverseSourceEntriesMock).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "EXPENSE_SETTLEMENT", sourceId: "expense-settlement-1" }));
    expect(createExpenseSettlementMovementMock).toHaveBeenCalledWith(expect.objectContaining({ direction: "IN", reversalOfId: "movement-1" }), expect.anything());
  });

  it("rejects reversing an expense settlement that has already been reversed", async () => {
    findExpenseSettlementForReversalMock.mockResolvedValue({ id: "expense-settlement-1", kind: "ORIGINAL", reversal: { id: "reversal-1" }, movement: { id: "movement-1" } });
    await expect(reverseExpenseSettlement({ organizationId: ORG, expenseSettlementId: "expense-settlement-1", reason: "tekrar", actorId: "actor-1" })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects reversing a reversal itself", async () => {
    findExpenseSettlementForReversalMock.mockResolvedValue({ id: "reversal-1", kind: "REVERSAL", reversal: null, movement: { id: "movement-1" } });
    await expect(reverseExpenseSettlement({ organizationId: ORG, expenseSettlementId: "reversal-1", reason: "tekrar", actorId: "actor-1" })).rejects.toMatchObject({ status: 409 });
  });

  it("requires a non-empty reason", async () => {
    await expect(reverseExpenseSettlement({ organizationId: ORG, expenseSettlementId: "expense-settlement-1", reason: "  ", actorId: "actor-1" })).rejects.toMatchObject({ status: 400 });
  });

  describe("REVERSAL IDEMPOTENCY", () => {
    it("replays the existing reversal instead of producing a second economic reversal when a P2002 race is hit on reversalOfId", async () => {
      const original = {
        id: "expense-settlement-1", kind: "ORIGINAL", expenseId: "expense-1", amount: 1000, currency: "TRY", paymentMethod: "CASH", financialAccountId: "account-1",
        movement: { id: "movement-1" }, reversal: null,
      };
      findExpenseSettlementForReversalMock.mockResolvedValue(original);
      createExpenseSettlementMock.mockRejectedValueOnce(p2002());
      const existingReversal = { id: "reversal-settlement-1", expenseId: "expense-1", movement: { id: "reversal-movement-1" } };
      findExpenseSettlementByReversalOfIdMock.mockResolvedValue(existingReversal);
      findExpenseByIdForOrganizationMock.mockResolvedValue(expense({ paidAmount: 400, status: "PARTIALLY_PAID" }));

      const outcome = await reverseExpenseSettlement({ organizationId: ORG, expenseSettlementId: "expense-settlement-1", reason: "yanlış tutar", actorId: "actor-1" });

      expect(outcome?.settlement.id).toBe("reversal-settlement-1");
      expect(outcome?.movement.id).toBe("reversal-movement-1");
    });

    it("propagates a non-P2002 error untouched instead of masking it as a replay", async () => {
      findExpenseSettlementForReversalMock.mockResolvedValue({
        id: "expense-settlement-1", kind: "ORIGINAL", expenseId: "expense-1", amount: 1000, currency: "TRY", paymentMethod: "CASH", financialAccountId: "account-1",
        movement: { id: "movement-1" }, reversal: null,
      });
      createExpenseSettlementMock.mockRejectedValueOnce(new Error("connection lost"));
      await expect(reverseExpenseSettlement({ organizationId: ORG, expenseSettlementId: "expense-settlement-1", reason: "yanlış tutar", actorId: "actor-1" })).rejects.toThrow("connection lost");
      expect(findExpenseSettlementByReversalOfIdMock).not.toHaveBeenCalled();
    });
  });
});
