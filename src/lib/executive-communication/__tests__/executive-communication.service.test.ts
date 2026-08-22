import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCustomerStatement: vi.fn(),
  findFirstCustomer: vi.fn(),
  createCommunication: vi.fn(),
  sendTransactionalEmail: vi.fn(),
}));

vi.mock("@/lib/accounting/customer-statement.service", () => ({ getCustomerStatement: mocks.getCustomerStatement }));
vi.mock("@/lib/core/email/resend-provider", () => ({ sendTransactionalEmail: mocks.sendTransactionalEmail }));
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    customer: { findFirst: mocks.findFirstCustomer },
    executiveCommunication: { create: mocks.createCommunication },
  },
}));

const { sendPaymentReminder } = await import("../executive-communication.service");

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

  it("sends a real email grounded in the real owed balance and records it", async () => {
    mocks.getCustomerStatement.mockResolvedValue({ balances: [{ currency: "TRY", balanceCents: "150000" }] });
    mocks.findFirstCustomer.mockResolvedValue({ displayName: "Atlas İnşaat", email: "atlas@example.com" });
    mocks.sendTransactionalEmail.mockResolvedValue({ providerMessageId: "msg1" });

    const outcome = await sendPaymentReminder({ organizationId: "org1", customerId: "c1", actorUserId: "u1" });

    expect(outcome).toMatchObject({ outcome: "SENT", recipientEmail: "atlas@example.com", currency: "TRY" });
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "atlas@example.com" }));
    expect(mocks.createCommunication).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ communicationType: "PAYMENT_REMINDER", status: "SENT", recipientEmail: "atlas@example.com" }),
    }));
  });

  it("records a FAILED communication and returns PROVIDER_FAILED when the email provider throws", async () => {
    mocks.getCustomerStatement.mockResolvedValue({ balances: [{ currency: "TRY", balanceCents: "150000" }] });
    mocks.findFirstCustomer.mockResolvedValue({ displayName: "Atlas İnşaat", email: "atlas@example.com" });
    mocks.sendTransactionalEmail.mockRejectedValue(new Error("Resend down"));

    const outcome = await sendPaymentReminder({ organizationId: "org1", customerId: "c1", actorUserId: "u1" });

    expect(outcome).toMatchObject({ outcome: "PROVIDER_FAILED", error: "Resend down" });
    expect(mocks.createCommunication).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });
});
