import { describe, expect, it, vi } from "vitest";

const listCustomers = vi.fn();
const sendPaymentReminder = vi.fn();
vi.mock("@/lib/core/customers/customer.service", () => ({ listCustomers: (...args: unknown[]) => listCustomers(...args) }));
vi.mock("../executive-communication.service", () => ({ sendPaymentReminder: (...args: unknown[]) => sendPaymentReminder(...args) }));

const { resolveAndSendPaymentReminder } = await import("../payment-reminder-trigger-resolver");

const CUSTOMER = { id: "c1", displayName: "Atlas İnşaat", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: "1234567890" };

describe("resolveAndSendPaymentReminder", () => {
  it("returns NOT_HANDLED for an unrelated utterance", async () => {
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "unsupported" }));
    const outcome = await resolveAndSendPaymentReminder({ utterance: "bugün hava nasıl", organizationId: "org1", actorUserId: "u1", generateText });
    expect(outcome.status).toBe("NOT_HANDLED");
    expect(sendPaymentReminder).not.toHaveBeenCalled();
  });

  it("asks for clarification when the customer is ambiguous", async () => {
    listCustomers.mockResolvedValue([CUSTOMER, { ...CUSTOMER, id: "c2" }]);
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "payment_reminder", customerNameRaw: "Atlas" }));
    const outcome = await resolveAndSendPaymentReminder({ utterance: "Atlas'a tahsilat hatırlatması gönder", organizationId: "org1", actorUserId: "u1", generateText });
    expect(outcome.status).toBe("CLARIFICATION_NEEDED");
    expect(sendPaymentReminder).not.toHaveBeenCalled();
  });

  it("resolves the customer and delegates to sendPaymentReminder", async () => {
    listCustomers.mockResolvedValue([CUSTOMER]);
    sendPaymentReminder.mockResolvedValue({ outcome: "SENT", communicationId: "comm1", recipientEmail: "atlas@example.com", amountOwedText: "1.500,00", currency: "TRY" });
    const generateText = vi.fn().mockResolvedValue(JSON.stringify({ result: "payment_reminder", customerNameRaw: "Atlas" }));

    const outcome = await resolveAndSendPaymentReminder({ utterance: "Atlas'a tahsilat hatırlatması gönder", organizationId: "org1", actorUserId: "u1", generateText });

    expect(sendPaymentReminder).toHaveBeenCalledWith({ organizationId: "org1", customerId: "c1", actorUserId: "u1" });
    expect(outcome).toMatchObject({ status: "SENT", customerName: "Atlas İnşaat" });
  });
});
