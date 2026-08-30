import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const {
  findPaymentByIdForOrganizationMock,
  applyPaymentAmountRepositoryMock,
  findInvoiceByIdMock,
  recordPaymentApplicationMock,
  reverseSourceEntriesMock,
  listFinancialAccountsMock,
  resolveFinancialAccountMock,
  assertMethodAccountCompatibilityMock,
  assertTransactionCurrencyMatchesAccountMock,
  createSettlementMock,
  createApplicationMock,
  createMovementMock,
  findSettlementByIdempotencyKeyMock,
  findSettlementForReversalMock,
  sumNetApplicationsMock,
  applicationFindFirstMock,
  movementFindFirstMock,
} = vi.hoisted(() => ({
  findPaymentByIdForOrganizationMock: vi.fn(),
  applyPaymentAmountRepositoryMock: vi.fn(),
  findInvoiceByIdMock: vi.fn(),
  recordPaymentApplicationMock: vi.fn(),
  reverseSourceEntriesMock: vi.fn(),
  listFinancialAccountsMock: vi.fn(),
  resolveFinancialAccountMock: vi.fn(),
  assertMethodAccountCompatibilityMock: vi.fn(),
  assertTransactionCurrencyMatchesAccountMock: vi.fn(),
  createSettlementMock: vi.fn(),
  createApplicationMock: vi.fn(),
  createMovementMock: vi.fn(),
  findSettlementByIdempotencyKeyMock: vi.fn(),
  findSettlementForReversalMock: vi.fn(),
  sumNetApplicationsMock: vi.fn(),
  applicationFindFirstMock: vi.fn(),
  movementFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({ payment: { aggregate: vi.fn().mockResolvedValue({ _sum: { paidAmount: 0 } }) }, invoice: { updateMany: vi.fn() } })),
    application: { findFirst: applicationFindFirstMock },
    financialAccountMovement: { findFirst: movementFindFirstMock },
  },
}));

vi.mock("@/lib/core/payments/payment.repository", async () => {
  const actual = await vi.importActual<typeof import("@/lib/core/payments/payment.repository")>("@/lib/core/payments/payment.repository");
  return {
    PaymentConcurrentlyModifiedError: actual.PaymentConcurrentlyModifiedError,
    findPaymentByIdForOrganization: findPaymentByIdForOrganizationMock,
    applyPaymentAmount: applyPaymentAmountRepositoryMock,
  };
});

vi.mock("@/lib/core/invoices/invoice.repository", () => ({ findInvoiceById: findInvoiceByIdMock }));

vi.mock("@/lib/accounting/ledger.service", () => ({
  recordPaymentApplication: recordPaymentApplicationMock,
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

vi.mock("../settlement.repository", () => ({
  createSettlement: createSettlementMock,
  createApplication: createApplicationMock,
  createMovement: createMovementMock,
  findSettlementByIdempotencyKey: findSettlementByIdempotencyKeyMock,
  findSettlementForReversal: findSettlementForReversalMock,
  sumNetApplications: sumNetApplicationsMock,
}));

import { applySettlement, reverseSettlement } from "../settlement.service";

const ORG = "org-1";
const ACCOUNT = { id: "account-1", organizationId: ORG, type: "CASH", name: "Ana Kasa", normalizedName: "ana kasa", currency: "TRY", status: "ACTIVE" };

function payment(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "payment-1", organizationId: ORG, amount: 1000, paidAmount: 0, currency: "TRY", status: "PENDING", invoiceId: null, ...overrides };
}

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.8.0" });
}

describe("applySettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listFinancialAccountsMock.mockResolvedValue([ACCOUNT]);
    resolveFinancialAccountMock.mockReturnValue({ kind: "RESOLVED", account: ACCOUNT });
    assertMethodAccountCompatibilityMock.mockReturnValue(undefined);
    assertTransactionCurrencyMatchesAccountMock.mockReturnValue(undefined);
    createSettlementMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "settlement-1", ...input }));
    createApplicationMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "application-1", ...input }));
    createMovementMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "movement-1", ...input }));
    applyPaymentAmountRepositoryMock.mockImplementation(async (input: { paidAmount: number; status: string }) => payment({ paidAmount: input.paidAmount, status: input.status }));
    findSettlementByIdempotencyKeyMock.mockResolvedValue(null);
  });

  it("rejects an amount exceeding the remaining balance", async () => {
    findPaymentByIdForOrganizationMock.mockResolvedValue(payment({ paidAmount: 900 }));
    await expect(
      applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 200, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" }),
    ).rejects.toMatchObject({ status: 409 });
    expect(createSettlementMock).not.toHaveBeenCalled();
  });

  it("fails closed on an unsupported settlement method before resolving any account", async () => {
    findPaymentByIdForOrganizationMock.mockResolvedValue(payment());
    await expect(
      applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 100, paymentMethod: "CHEQUE" as never, financialAccountReference: "account-1", actorId: "actor-1" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(listFinancialAccountsMock).not.toHaveBeenCalled();
    expect(createSettlementMock).not.toHaveBeenCalled();
  });

  it("records two partial applications as two distinct incremental ledger postings", async () => {
    findPaymentByIdForOrganizationMock.mockResolvedValueOnce(payment({ paidAmount: 0 }));
    await applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 400, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" });

    findPaymentByIdForOrganizationMock.mockResolvedValueOnce(payment({ paidAmount: 400 }));
    await applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 600, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" });

    expect(recordPaymentApplicationMock).toHaveBeenCalledTimes(2);
    expect(recordPaymentApplicationMock.mock.calls[0]![0]).toMatchObject({ amount: 400 });
    expect(recordPaymentApplicationMock.mock.calls[1]![0]).toMatchObject({ amount: 600 });
    expect(createSettlementMock).toHaveBeenCalledTimes(2);
    expect(applyPaymentAmountRepositoryMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ paidAmount: 1000, status: "PAID" }), expect.anything());
  });

  it("replays an existing settlement on idempotency-key match without creating a new one", async () => {
    findPaymentByIdForOrganizationMock.mockResolvedValue(payment({ paidAmount: 400 }));
    findSettlementByIdempotencyKeyMock.mockResolvedValue({ id: "settlement-1", currency: "TRY", requestHash: "will-be-recomputed" });
    applicationFindFirstMock.mockResolvedValue({ id: "application-1" });
    movementFindFirstMock.mockResolvedValue({ id: "movement-1" });

    // First establish the canonical hash by letting a real create happen, then reuse it for the replay lookup.
    createSettlementMock.mockImplementationOnce(async (input: Record<string, unknown>) => ({ id: "settlement-1", ...input }));
    findSettlementByIdempotencyKeyMock.mockResolvedValueOnce(null);
    const original = await applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", occurredAt: new Date("2026-08-30T00:00:00.000Z"), idempotencyKey: "key-1", actorId: "actor-1" });
    const storedHash = createSettlementMock.mock.calls[0]![0].requestHash;

    findSettlementByIdempotencyKeyMock.mockResolvedValue({ id: "settlement-1", currency: "TRY", requestHash: storedHash });
    createSettlementMock.mockClear();
    const replay = await applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", occurredAt: new Date("2026-08-30T00:00:00.000Z"), idempotencyKey: "key-1", actorId: "actor-1" });

    expect(original?.replayed).toBe(false);
    expect(replay?.replayed).toBe(true);
    expect(createSettlementMock).not.toHaveBeenCalled();
  });

  it("rejects a replay attempt whose payload no longer matches the stored request hash", async () => {
    findPaymentByIdForOrganizationMock.mockResolvedValue(payment({ paidAmount: 400 }));
    findSettlementByIdempotencyKeyMock.mockResolvedValue({ id: "settlement-1", currency: "TRY", requestHash: "a-different-hash" });

    await expect(
      applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", idempotencyKey: "key-1", actorId: "actor-1" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("replays correctly even when neither call passes occurredAt (regression: the hash must not depend on server-side defaulting)", async () => {
    findPaymentByIdForOrganizationMock.mockResolvedValue(payment({ paidAmount: 400 }));
    findSettlementByIdempotencyKeyMock.mockResolvedValueOnce(null);
    applicationFindFirstMock.mockResolvedValue({ id: "application-1" });
    movementFindFirstMock.mockResolvedValue({ id: "movement-1" });

    const original = await applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", idempotencyKey: "key-1", actorId: "actor-1" });
    const storedHash = createSettlementMock.mock.calls[0]![0].requestHash;

    findSettlementByIdempotencyKeyMock.mockResolvedValue({ id: "settlement-1", currency: "TRY", requestHash: storedHash });
    createSettlementMock.mockClear();
    const replay = await applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", idempotencyKey: "key-1", actorId: "actor-1" });

    expect(original?.replayed).toBe(false);
    expect(replay?.replayed).toBe(true);
    expect(createSettlementMock).not.toHaveBeenCalled();
  });

  it("threads referenceNumber and externalReference through to the created Settlement", async () => {
    findPaymentByIdForOrganizationMock.mockResolvedValue(payment());
    await applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", referenceNumber: "DEKONT-42", externalReference: "stmt-line-7", actorId: "actor-1" });
    expect(createSettlementMock).toHaveBeenCalledWith(expect.objectContaining({ referenceNumber: "DEKONT-42", externalReference: "stmt-line-7" }), expect.anything());
  });

  it("enforces that the Application amount never exceeds its Settlement amount, even if the repository misbehaves", async () => {
    findPaymentByIdForOrganizationMock.mockResolvedValue(payment());
    createSettlementMock.mockImplementationOnce(async (input: Record<string, unknown>) => ({ id: "settlement-1", ...input, amount: 50 }));
    await expect(
      applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" }),
    ).rejects.toMatchObject({ status: 500 });
    expect(createApplicationMock).not.toHaveBeenCalled();
  });

  describe("concurrency", () => {
    it("CONCURRENT IDEMPOTENCY GUARANTEE: two simultaneous requests with the same idempotencyKey produce exactly one committed Settlement — the loser replays it instead of duplicating", async () => {
      findPaymentByIdForOrganizationMock.mockResolvedValue(payment({ paidAmount: 0 }));
      applicationFindFirstMock.mockResolvedValue({ id: "application-1" });
      movementFindFirstMock.mockResolvedValue({ id: "movement-1" });

      // Both requests race past the pre-check "not found" window — this is
      // the scenario the DB unique constraint, not the pre-check, must
      // ultimately arbitrate.
      findSettlementByIdempotencyKeyMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      let committed: Record<string, unknown> | null = null;
      createSettlementMock.mockImplementation(async (input: Record<string, unknown>) => {
        if (committed) {
          // Models Postgres: the second concurrent INSERT blocks on the
          // unique index until the first commits, then raises a real
          // unique_violation once it sees the now-committed row.
          throw p2002();
        }
        committed = { id: "settlement-1", ...input };
        return committed;
      });
      // The loser's catch-block re-query must see the winner's committed row.
      findSettlementByIdempotencyKeyMock.mockImplementation(async () => committed as never);

      const attempt = () =>
        applySettlement({
          organizationId: ORG, paymentId: "payment-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1",
          occurredAt: new Date("2026-08-30T00:00:00.000Z"), idempotencyKey: "key-1", actorId: "actor-1",
        });

      const [outcomeA, outcomeB] = await Promise.all([attempt(), attempt()]);
      const outcomes = [outcomeA, outcomeB];

      expect(outcomes.filter((outcome) => outcome?.replayed === false)).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome?.replayed === true)).toHaveLength(1);
      expect(outcomeA?.settlement.id).toBe(outcomeB?.settlement.id);
      expect(createSettlementMock).toHaveBeenCalledTimes(2); // one real insert + one rejected attempt — never two committed rows
    });

    it("CONCURRENT APPLICATION CEILING: a concurrent-modification conflict forces a fresh re-read that correctly re-rejects a now-invalid amount, instead of blindly retrying the stale one", async () => {
      // Both requests read paidAmount=0 (the race window: neither has seen
      // the other's write yet), both compute "600 fits in the 1000 ceiling."
      // Only one CAS write can win; the loser's retry must re-read the
      // POST-WIN state (600) and correctly reject 600 more as exceeding the
      // now-remaining 400 — not silently re-apply the stale verdict.
      findPaymentByIdForOrganizationMock
        .mockResolvedValueOnce(payment({ paidAmount: 0 }))
        .mockResolvedValueOnce(payment({ paidAmount: 0 }))
        .mockResolvedValueOnce(payment({ paidAmount: 600 }));

      applyPaymentAmountRepositoryMock
        .mockImplementationOnce(async (input: { paidAmount: number; status: string }) => payment({ paidAmount: input.paidAmount, status: input.status }))
        .mockImplementationOnce(async () => {
          const { PaymentConcurrentlyModifiedError } = await import("@/lib/core/payments/payment.repository");
          throw new PaymentConcurrentlyModifiedError("payment-1");
        });

      const attempt = () =>
        applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 600, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" });

      const [winner, loser] = await Promise.allSettled([attempt(), attempt()]);

      expect(winner.status).toBe("fulfilled");
      expect(loser.status).toBe("rejected");
      if (loser.status === "rejected") {
        expect(loser.reason).toMatchObject({ status: 409 });
      }
      // Exactly two payment-write attempts: the winner's, and the loser's
      // single conflicting attempt. The loser's retry stops at the
      // remaining-balance guard and never reaches a third write attempt —
      // proof the ceiling held across the race instead of being silently
      // breached by a stale retry.
      expect(applyPaymentAmountRepositoryMock).toHaveBeenCalledTimes(2);
    });

    it("gives up with a clear 409 after exhausting the concurrent-modification retry budget", async () => {
      findPaymentByIdForOrganizationMock.mockResolvedValue(payment({ paidAmount: 0 }));
      const { PaymentConcurrentlyModifiedError } = await import("@/lib/core/payments/payment.repository");
      applyPaymentAmountRepositoryMock.mockImplementation(async () => {
        throw new PaymentConcurrentlyModifiedError("payment-1");
      });

      await expect(
        applySettlement({ organizationId: ORG, paymentId: "payment-1", amount: 100, paymentMethod: "CASH", financialAccountReference: "account-1", actorId: "actor-1" }),
      ).rejects.toMatchObject({ status: 409 });
      expect(applyPaymentAmountRepositoryMock).toHaveBeenCalledTimes(5);
    });
  });
});

describe("reverseSettlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSettlementMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "reversal-settlement-1", ...input }));
    createApplicationMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "reversal-application-1", ...input }));
    createMovementMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "reversal-movement-1", ...input }));
  });

  it("reverses a settlement, moves the payment back from PAID to PARTIAL, and un-PAIDs the linked invoice", async () => {
    findSettlementForReversalMock.mockResolvedValue({
      id: "settlement-1", kind: "ORIGINAL", paymentId: "payment-1", amount: 1000, currency: "TRY", paymentMethod: "CASH", financialAccountId: "account-1",
      applications: [{ id: "application-1", kind: "ORIGINAL" }],
      movements: [{ id: "movement-1", direction: "IN" }],
      reversal: null,
    });
    sumNetApplicationsMock.mockResolvedValue(400);
    findPaymentByIdForOrganizationMock.mockResolvedValue(payment({ paidAmount: 1000, status: "PAID", invoiceId: "invoice-1", paidAt: new Date() }));
    applyPaymentAmountRepositoryMock.mockResolvedValue(payment({ paidAmount: 400, status: "PARTIAL", invoiceId: "invoice-1" }));
    findInvoiceByIdMock.mockResolvedValue({ id: "invoice-1", status: "PAID", totalAmount: 1000 });

    const outcome = await reverseSettlement({ organizationId: ORG, settlementId: "settlement-1", reason: "yanlış tutar", actorId: "actor-1" });

    expect(outcome?.payment.status).toBe("PARTIAL");
    expect(reverseSourceEntriesMock).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "PAYMENT_APPLICATION", sourceId: "application-1" }));
    expect(applyPaymentAmountRepositoryMock).toHaveBeenCalledWith(expect.objectContaining({ status: "PARTIAL", paidAmount: 400 }), expect.anything());
  });

  it("rejects reversing a settlement that has already been reversed", async () => {
    findSettlementForReversalMock.mockResolvedValue({ id: "settlement-1", kind: "ORIGINAL", reversal: { id: "reversal-1" }, applications: [], movements: [] });
    await expect(reverseSettlement({ organizationId: ORG, settlementId: "settlement-1", reason: "tekrar", actorId: "actor-1" })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects reversing a reversal itself", async () => {
    findSettlementForReversalMock.mockResolvedValue({ id: "reversal-1", kind: "REVERSAL", reversal: null, applications: [], movements: [] });
    await expect(reverseSettlement({ organizationId: ORG, settlementId: "reversal-1", reason: "tekrar", actorId: "actor-1" })).rejects.toMatchObject({ status: 409 });
  });

  it("requires a non-empty reason", async () => {
    await expect(reverseSettlement({ organizationId: ORG, settlementId: "settlement-1", reason: "  ", actorId: "actor-1" })).rejects.toMatchObject({ status: 400 });
  });
});
