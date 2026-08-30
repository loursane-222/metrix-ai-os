import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const {
  findInvoiceByIdMock,
  createPaymentMock,
  findPaymentByIdForOrganizationMock,
  findExpenseByIdForOrganizationMock,
  createObligationScheduleLineMock,
  findObligationScheduleLinesForSourceMock,
} = vi.hoisted(() => ({
  findInvoiceByIdMock: vi.fn(),
  createPaymentMock: vi.fn(),
  findPaymentByIdForOrganizationMock: vi.fn(),
  findExpenseByIdForOrganizationMock: vi.fn(),
  createObligationScheduleLineMock: vi.fn(),
  findObligationScheduleLinesForSourceMock: vi.fn(),
}));

function p2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "7.8.0" });
}

vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})) },
}));

vi.mock("@/lib/core/invoices/invoice.repository", () => ({ findInvoiceById: findInvoiceByIdMock }));
vi.mock("@/lib/core/payments/payment.repository", () => ({ createPayment: createPaymentMock, findPaymentByIdForOrganization: findPaymentByIdForOrganizationMock }));
vi.mock("@/lib/core/expenses/expense-repository", () => ({ findExpenseByIdForOrganization: findExpenseByIdForOrganizationMock }));
vi.mock("../obligation-schedule.repository", () => ({
  createObligationScheduleLine: createObligationScheduleLineMock,
  findObligationScheduleLinesForSource: findObligationScheduleLinesForSourceMock,
}));

import { materializePayableSchedule, materializeReceivableSchedule } from "../obligation-schedule.service";

const ORG = "org-1";
const INVOICE_UPDATED_AT = new Date("2026-08-01T09:00:00.000Z");

function invoice(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "invoice-1", organizationId: ORG, customerId: "customer-1", quoteId: null, title: "Ekim Faturası",
    amount: 1000, taxRate: 20, taxAmount: 200, totalAmount: 1200, currency: "TRY",
    dueDate: null, paymentTermSnapshot: null, status: "SENT", updatedAt: INVOICE_UPDATED_AT, ...overrides,
  };
}

function expense(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: "expense-1", organizationId: ORG, amount: 500, currency: "TRY", status: "PENDING", ...overrides };
}

describe("materializeReceivableSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findObligationScheduleLinesForSourceMock.mockResolvedValue([]);
    createPaymentMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: `payment-${createPaymentMock.mock.calls.length}`, ...input }));
    createObligationScheduleLineMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: `line-${createObligationScheduleLineMock.mock.calls.length}`, ...input }));
  });

  it("materializes a 50% upfront + 50% in 30 days term into two schedule lines and two Payment shells — never flattened into one dueDate", async () => {
    findInvoiceByIdMock.mockResolvedValue(invoice({
      paymentTermSnapshot: {
        schemaVersion: 1, strategy: "SCHEDULE",
        components: [
          { allocationType: "PERCENTAGE", percentageBasisPoints: 5000, maturityBasis: "IMMEDIATE" },
          { allocationType: "REMAINDER", maturityBasis: "DAYS_AFTER_REFERENCE", days: 30, referenceDateType: "INVOICE_DATE" },
        ],
      },
    }));

    const outcome = await materializeReceivableSchedule({ organizationId: ORG, invoiceId: "invoice-1", actorId: "actor-1" });

    expect(outcome.lines).toHaveLength(2);
    expect(outcome.payments).toHaveLength(2);
    expect(outcome.replayed).toBe(false);
    expect(Number(outcome.payments[0]!.amount)).toBe(600);
    expect(Number(outcome.payments[1]!.amount)).toBe(600);
    expect(outcome.lines[0]!.dueDate).not.toEqual(outcome.lines[1]!.dueDate); // two distinct due dates, not flattened
    expect(createPaymentMock).toHaveBeenCalledTimes(2);
    expect(createPaymentMock.mock.calls[0]![0]).toMatchObject({ customerId: "customer-1", invoiceId: "invoice-1", amount: 600 });
  });

  it("falls back to a trivial single-line term from the invoice's flat dueDate when there is no structured term", async () => {
    findInvoiceByIdMock.mockResolvedValue(invoice({ dueDate: new Date("2026-09-30T00:00:00.000Z"), paymentTermSnapshot: null }));

    const outcome = await materializeReceivableSchedule({ organizationId: ORG, invoiceId: "invoice-1", actorId: "actor-1" });

    expect(outcome.lines).toHaveLength(1);
    expect(Number(outcome.payments[0]!.amount)).toBe(1200);
    expect(outcome.lines[0]!.allocationType).toBe("REMAINDER");
    expect(outcome.lines[0]!.maturityBasis).toBe("FIXED_DATE");
  });

  it("rejects materializing a DRAFT invoice", async () => {
    findInvoiceByIdMock.mockResolvedValue(invoice({ status: "DRAFT" }));
    await expect(materializeReceivableSchedule({ organizationId: ORG, invoiceId: "invoice-1", actorId: "actor-1" })).rejects.toMatchObject({ status: 409 });
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it("rejects materializing an invoice with no customer", async () => {
    findInvoiceByIdMock.mockResolvedValue(invoice({ customerId: null }));
    await expect(materializeReceivableSchedule({ organizationId: ORG, invoiceId: "invoice-1", actorId: "actor-1" })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects re-materializing an invoice that already has a schedule", async () => {
    findInvoiceByIdMock.mockResolvedValue(invoice());
    findObligationScheduleLinesForSourceMock.mockResolvedValue([{ id: "line-existing" }]);
    await expect(materializeReceivableSchedule({ organizationId: ORG, invoiceId: "invoice-1", actorId: "actor-1" })).rejects.toMatchObject({ status: 409 });
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it("fails closed (does not guess) when a structured term references a date that isn't available", async () => {
    findInvoiceByIdMock.mockResolvedValue(invoice({
      paymentTermSnapshot: {
        schemaVersion: 1, strategy: "SCHEDULE",
        components: [{ allocationType: "REMAINDER", maturityBasis: "DAYS_AFTER_REFERENCE", days: 30, referenceDateType: "ORDER_DATE" }],
      },
    }));
    await expect(materializeReceivableSchedule({ organizationId: ORG, invoiceId: "invoice-1", actorId: "actor-1" })).rejects.toMatchObject({ status: 422 });
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  describe("REFERENCE DATE AUTHORITY", () => {
    it("uses the caller-supplied referenceDate (e.g. the exact invoice.send transition moment) rather than 'materialize time'", async () => {
      const sendMoment = new Date("2026-08-15T14:30:00.000Z");
      findInvoiceByIdMock.mockResolvedValue(invoice({
        paymentTermSnapshot: { schemaVersion: 1, strategy: "SCHEDULE", components: [{ allocationType: "REMAINDER", maturityBasis: "DAYS_AFTER_REFERENCE", days: 10, referenceDateType: "INVOICE_DATE" }] },
      }));

      const outcome = await materializeReceivableSchedule({ organizationId: ORG, invoiceId: "invoice-1", actorId: "actor-1", referenceDate: sendMoment });

      const expectedDueDate = new Date("2026-08-25T00:00:00.000Z");
      expect((outcome.lines[0]!.dueDate as Date).toISOString().slice(0, 10)).toBe(expectedDueDate.toISOString().slice(0, 10));
    });

    it("falls back to the invoice's own persisted updatedAt (a real fact) when no referenceDate is given — never new Date()/'materialize time'", async () => {
      findInvoiceByIdMock.mockResolvedValue(invoice({
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        paymentTermSnapshot: { schemaVersion: 1, strategy: "SCHEDULE", components: [{ allocationType: "REMAINDER", maturityBasis: "DAYS_AFTER_REFERENCE", days: 10, referenceDateType: "INVOICE_DATE" }] },
      }));

      const outcome = await materializeReceivableSchedule({ organizationId: ORG, invoiceId: "invoice-1", actorId: "actor-1" });

      expect((outcome.lines[0]!.dueDate as Date).toISOString().slice(0, 10)).toBe("2026-01-11");
    });
  });

  describe("CONCURRENT MATERIALIZATION", () => {
    it("two simultaneous materialize calls for the same invoice produce exactly one committed schedule — the loser replays it instead of duplicating lines/payments", async () => {
      findInvoiceByIdMock.mockResolvedValue(invoice());
      findObligationScheduleLinesForSourceMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      let committedLine: Record<string, unknown> | null = null;
      let committedPayment: Record<string, unknown> | null = null;
      createPaymentMock.mockImplementation(async (input: Record<string, unknown>) => {
        const payment = { id: "payment-winner", ...input };
        committedPayment = payment;
        return payment;
      });
      createObligationScheduleLineMock.mockImplementation(async (input: Record<string, unknown>) => {
        if (committedLine) {
          // Models Postgres: the second concurrent INSERT blocks on the
          // (organizationId, sourceType, sourceId, componentIndex) unique
          // index until the first commits, then raises unique_violation.
          throw p2002();
        }
        committedLine = { id: "line-winner", ...input };
        return committedLine;
      });
      findObligationScheduleLinesForSourceMock.mockImplementation(async () => (committedLine ? [committedLine] : []));
      findPaymentByIdForOrganizationMock.mockImplementation(async () => committedPayment);

      const attempt = () => materializeReceivableSchedule({ organizationId: ORG, invoiceId: "invoice-1", actorId: "actor-1" });
      const [outcomeA, outcomeB] = await Promise.all([attempt(), attempt()]);
      const outcomes = [outcomeA, outcomeB];

      expect(outcomes.filter((outcome) => outcome.replayed === false)).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.replayed === true)).toHaveLength(1);
      expect(outcomeA.lines[0]!.id).toBe(outcomeB.lines[0]!.id);
      expect(outcomeA.payments[0]!.id).toBe(outcomeB.payments[0]!.id);
      expect(createObligationScheduleLineMock).toHaveBeenCalledTimes(2); // one real insert + one rejected attempt — never two committed lines
    });
  });
});

describe("materializePayableSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findObligationScheduleLinesForSourceMock.mockResolvedValue([]);
    createObligationScheduleLineMock.mockImplementation(async (input: Record<string, unknown>) => ({ id: "line-1", ...input }));
  });

  it("materializes exactly one schedule line for an expense's payable obligation", async () => {
    findExpenseByIdForOrganizationMock.mockResolvedValue(expense());
    const outcome = await materializePayableSchedule({ organizationId: ORG, expenseId: "expense-1", dueDate: new Date("2026-10-01T00:00:00.000Z"), actorId: "actor-1" });
    expect(outcome.line.direction).toBe("PAYABLE");
    expect(outcome.line.expenseId).toBe("expense-1");
    expect(outcome.line.originalAmount).toBe(500);
    expect(outcome.replayed).toBe(false);
  });

  it("rejects materializing a cancelled expense", async () => {
    findExpenseByIdForOrganizationMock.mockResolvedValue(expense({ status: "CANCELLED" }));
    await expect(materializePayableSchedule({ organizationId: ORG, expenseId: "expense-1", dueDate: new Date(), actorId: "actor-1" })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects re-materializing an expense that already has a schedule line", async () => {
    findExpenseByIdForOrganizationMock.mockResolvedValue(expense());
    findObligationScheduleLinesForSourceMock.mockResolvedValue([{ id: "line-existing" }]);
    await expect(materializePayableSchedule({ organizationId: ORG, expenseId: "expense-1", dueDate: new Date(), actorId: "actor-1" })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects an invalid dueDate", async () => {
    await expect(materializePayableSchedule({ organizationId: ORG, expenseId: "expense-1", dueDate: new Date("not-a-date"), actorId: "actor-1" })).rejects.toMatchObject({ status: 400 });
  });

  describe("CONCURRENT MATERIALIZATION", () => {
    it("two simultaneous materialize calls for the same expense produce exactly one committed schedule line — the loser replays it", async () => {
      findExpenseByIdForOrganizationMock.mockResolvedValue(expense());
      findObligationScheduleLinesForSourceMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      let committedLine: Record<string, unknown> | null = null;
      createObligationScheduleLineMock.mockImplementation(async (input: Record<string, unknown>) => {
        if (committedLine) throw p2002();
        committedLine = { id: "line-winner", ...input };
        return committedLine;
      });
      findObligationScheduleLinesForSourceMock.mockImplementation(async () => (committedLine ? [committedLine] : []));

      const attempt = () => materializePayableSchedule({ organizationId: ORG, expenseId: "expense-1", dueDate: new Date("2026-10-01T00:00:00.000Z"), actorId: "actor-1" });
      const [outcomeA, outcomeB] = await Promise.all([attempt(), attempt()]);
      const outcomes = [outcomeA, outcomeB];

      expect(outcomes.filter((outcome) => outcome.replayed === false)).toHaveLength(1);
      expect(outcomes.filter((outcome) => outcome.replayed === true)).toHaveLength(1);
      expect(outcomeA.line.id).toBe(outcomeB.line.id);
      expect(createObligationScheduleLineMock).toHaveBeenCalledTimes(2);
    });
  });
});
