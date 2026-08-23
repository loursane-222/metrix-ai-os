import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCustomerStatement: vi.fn(),
  findFirstCustomer: vi.fn(),
  findFirstSupplier: vi.fn(),
  findUniqueOrgThrow: vi.fn(),
  createCommunication: vi.fn(),
  sendTransactionalEmail: vi.fn(),
}));

vi.mock("@/lib/accounting/customer-statement.service", () => ({ getCustomerStatement: mocks.getCustomerStatement }));
vi.mock("@/lib/core/email/resend-provider", () => ({ sendTransactionalEmail: mocks.sendTransactionalEmail }));
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    customer: { findFirst: mocks.findFirstCustomer },
    supplier: { findFirst: mocks.findFirstSupplier },
    organization: { findUniqueOrThrow: mocks.findUniqueOrgThrow },
    executiveCommunication: { create: mocks.createCommunication },
  },
}));

const { sendPaymentReminder, sendSupplierMessage } = await import("../executive-communication.service");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createCommunication.mockResolvedValue({ id: "comm1" });
});

describe("sendPaymentReminder", () => {
  it("returns NO_OUTSTANDING_BALANCE when the customer owes nothing", async () => {
    mocks.getCustomerStatement.mockResolvedValue({ balances: [{ currency: "TRY", balanceCents: "0" }] });
    const outcome = await sendPaymentReminder({ organizationId: "org1", customerId: "c1", actorUserId: "u1" });
    expect(outcome.outcome).toBe("NO_OUTSTANDING_BALANCE");
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("returns CUSTOMER_NOT_FOUND when the statement is null", async () => {
    mocks.getCustomerStatement.mockResolvedValue(null);
    const outcome = await sendPaymentReminder({ organizationId: "org1", customerId: "missing", actorUserId: "u1" });
    expect(outcome.outcome).toBe("CUSTOMER_NOT_FOUND");
  });

  it("returns MISSING_RECIPIENT_EMAIL when the customer has no email", async () => {
    mocks.getCustomerStatement.mockResolvedValue({ balances: [{ currency: "TRY", balanceCents: "150000" }] });
    mocks.findFirstCustomer.mockResolvedValue({ displayName: "Atlas", email: null });
    const outcome = await sendPaymentReminder({ organizationId: "org1", customerId: "c1", actorUserId: "u1" });
    expect(outcome.outcome).toBe("MISSING_RECIPIENT_EMAIL");
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("sends a real email grounded in the real owed balance and records it, at FRIENDLY tone when nothing is overdue yet", async () => {
    mocks.getCustomerStatement.mockResolvedValue({ balances: [{ currency: "TRY", balanceCents: "150000" }], movements: [] });
    mocks.findFirstCustomer.mockResolvedValue({ displayName: "Atlas İnşaat", email: "atlas@example.com" });
    mocks.sendTransactionalEmail.mockResolvedValue({ providerMessageId: "msg1" });

    const outcome = await sendPaymentReminder({ organizationId: "org1", customerId: "c1", actorUserId: "u1" });

    expect(outcome).toMatchObject({ outcome: "SENT", recipientEmail: "atlas@example.com", currency: "TRY" });
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "atlas@example.com" }));
    expect(mocks.createCommunication).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ communicationType: "PAYMENT_REMINDER", status: "SENT", recipientEmail: "atlas@example.com", toneStrategy: "FRIENDLY" }),
    }));
  });

  it("records a FAILED communication and returns PROVIDER_FAILED when the email provider throws", async () => {
    mocks.getCustomerStatement.mockResolvedValue({ balances: [{ currency: "TRY", balanceCents: "150000" }], movements: [] });
    mocks.findFirstCustomer.mockResolvedValue({ displayName: "Atlas İnşaat", email: "atlas@example.com" });
    mocks.sendTransactionalEmail.mockRejectedValue(new Error("Resend down"));

    const outcome = await sendPaymentReminder({ organizationId: "org1", customerId: "c1", actorUserId: "u1" });

    expect(outcome).toMatchObject({ outcome: "PROVIDER_FAILED", error: "Resend down" });
    expect(mocks.createCommunication).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("escalates tone to FORMAL with one real overdue payment, DIRECT with more than one", async () => {
    mocks.findFirstCustomer.mockResolvedValue({ displayName: "Atlas İnşaat", email: "atlas@example.com" });
    mocks.sendTransactionalEmail.mockResolvedValue({ providerMessageId: "msg1" });

    mocks.getCustomerStatement.mockResolvedValue({
      balances: [{ currency: "TRY", balanceCents: "150000" }],
      movements: [{ sourceType: "PAYMENT", status: "OVERDUE" }, { sourceType: "PAYMENT", status: "PENDING" }, { sourceType: "INVOICE", status: "OVERDUE" }],
    });
    await sendPaymentReminder({ organizationId: "org1", customerId: "c1", actorUserId: "u1" });
    expect(mocks.createCommunication).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ toneStrategy: "FORMAL" }) }));

    mocks.getCustomerStatement.mockResolvedValue({
      balances: [{ currency: "TRY", balanceCents: "150000" }],
      movements: [{ sourceType: "PAYMENT", status: "OVERDUE" }, { sourceType: "PAYMENT", status: "OVERDUE" }],
    });
    await sendPaymentReminder({ organizationId: "org1", customerId: "c1", actorUserId: "u1" });
    expect(mocks.createCommunication).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ toneStrategy: "DIRECT" }) }));
  });
});

describe("sendSupplierMessage", () => {
  it("returns SUPPLIER_NOT_FOUND when the supplier doesn't belong to this organization", async () => {
    mocks.findFirstSupplier.mockResolvedValue(null);
    const outcome = await sendSupplierMessage({ organizationId: "org1", supplierId: "s1", messageBody: "Merhaba", actorUserId: "u1" });
    expect(outcome.outcome).toBe("SUPPLIER_NOT_FOUND");
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("returns MISSING_RECIPIENT_EMAIL when the supplier has no email", async () => {
    mocks.findFirstSupplier.mockResolvedValue({ displayName: "Vega Metal", email: null });
    const outcome = await sendSupplierMessage({ organizationId: "org1", supplierId: "s1", messageBody: "Merhaba", actorUserId: "u1" });
    expect(outcome.outcome).toBe("MISSING_RECIPIENT_EMAIL");
  });

  it("sends the user's own dictated message verbatim, never composing content itself", async () => {
    mocks.findFirstSupplier.mockResolvedValue({ displayName: "Vega Metal", email: "vega@example.com" });
    mocks.findUniqueOrgThrow.mockResolvedValue({ name: "METRIX Demo" });
    mocks.sendTransactionalEmail.mockResolvedValue({ providerMessageId: "msg2" });

    const outcome = await sendSupplierMessage({ organizationId: "org1", supplierId: "s1", messageBody: "Siparişin teslim tarihini onaylar mısınız?", actorUserId: "u1" });

    expect(outcome).toMatchObject({ outcome: "SENT", recipientEmail: "vega@example.com" });
    const [call] = mocks.sendTransactionalEmail.mock.calls[0];
    expect(call.text).toContain("Siparişin teslim tarihini onaylar mısınız?");
    expect(mocks.createCommunication).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ communicationType: "SUPPLIER_MESSAGE", audienceType: "SUPPLIER", supplierId: "s1" }),
    }));
  });
});

describe("selectPaymentReminderTone", () => {
  it("ignores non-PAYMENT and non-OVERDUE movements entirely", async () => {
    const { selectPaymentReminderTone } = await import("../executive-communication.service");
    expect(selectPaymentReminderTone([
      { sourceType: "INVOICE", status: "OVERDUE" } as never,
      { sourceType: "PAYMENT", status: "PENDING" } as never,
      { sourceType: "PAYMENT", status: "PAID" } as never,
    ])).toBe("FRIENDLY");
  });
});
