import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  windowOpen: vi.fn(),
  requestPaymentReminder: vi.fn(),
}));

vi.mock("@/lib/customers/customers-client", () => ({ listCustomers: mocks.listCustomers }));
vi.mock("@/lib/executive-communication/executive-communication-client", () => ({ requestPaymentReminder: mocks.requestPaymentReminder }));

const { paymentReminderConversationExtension } = await import("../payment-reminder-conversation-extension");

const customer = { id: "c-1", displayName: "Atlas İnşaat", legalName: null, phone: "0532 111 22 33", email: null, cariKodu: null, taxNumber: null };

function mockFetchOnce(status: number, body: unknown): void {
  global.fetch = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as typeof fetch;
}

describe("payment-reminder-conversation-extension — WhatsApp statement/mutabakat send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { window?: unknown }).window = { open: mocks.windowOpen };
  });

  it("does not handle utterances that don't mention ekstre/mutabakat/hesap özeti", async () => {
    const result = await paymentReminderConversationExtension.execute("bugün hava nasıl");
    expect(result.status).toBe("NOT_HANDLED");
  });

  it("asks for clarification when the named customer can't be found", async () => {
    mocks.listCustomers.mockResolvedValue({ ok: true, data: { customers: [] } });
    const result = await paymentReminderConversationExtension.execute("Bilinmeyen Firma'ya ekstre gönder");
    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.outcomeCode).toBe("PAYMENT_REMINDER_WHATSAPP_CUSTOMER_NOT_FOUND");
    expect(result.handoff?.resultStatus).toBe("CLARIFICATION_REQUIRED");
  });

  it("asks for clarification when the customer has no usable phone number", async () => {
    mocks.listCustomers.mockResolvedValue({ ok: true, data: { customers: [{ ...customer, phone: null }] } });
    const result = await paymentReminderConversationExtension.execute("Atlas İnşaat'a mutabakat gönder");
    expect(result.handoff?.outcomeCode).toBe("PAYMENT_REMINDER_WHATSAPP_PHONE_MISSING");
    expect(mocks.windowOpen).not.toHaveBeenCalled();
  });

  it("composes a real wa.me link with the customer's normalized phone, real balance, and the public statement URL, then lets the user press send themselves", async () => {
    mocks.listCustomers.mockResolvedValue({ ok: true, data: { customers: [customer] } });
    mockFetchOnce(200, { ok: true, data: { publicUrl: "https://metrix.test/mutabakat/tok123", organizationName: "METRIX Demo", balances: [{ currency: "TRY", balanceCents: "150000" }] } });

    const result = await paymentReminderConversationExtension.execute("Atlas İnşaat'a ekstresini whatsap'tan gönder");

    expect(result.handoff?.outcomeCode).toBe("PAYMENT_REMINDER_WHATSAPP_STATEMENT_READY");
    expect(result.handoff?.resultStatus).toBe("EXECUTED");
    expect(result.handoff?.mutationPerformed).toBe(true);
    expect(mocks.windowOpen).toHaveBeenCalledTimes(1);
    const [url] = mocks.windowOpen.mock.calls[0] as [string];
    expect(url).toContain("https://wa.me/905321112233?text=");
    const decoded = decodeURIComponent(url.split("text=")[1]!);
    expect(decoded).toContain("https://metrix.test/mutabakat/tok123");
    expect(decoded).toContain("METRIX Demo");
    expect(decoded).toMatch(/1\.500,00|1,500\.00/); // real balance, not invented
  });

  it("reports a failure outcome, never opening WhatsApp, when the public-link request fails", async () => {
    mocks.listCustomers.mockResolvedValue({ ok: true, data: { customers: [customer] } });
    mockFetchOnce(500, { ok: false });

    const result = await paymentReminderConversationExtension.execute("Atlas İnşaat'a hesap özetini gönder");

    expect(result.handoff?.outcomeCode).toBe("PAYMENT_REMINDER_WHATSAPP_LINK_FAILED");
    expect(result.handoff?.resultStatus).toBe("FAILED");
    expect(mocks.windowOpen).not.toHaveBeenCalled();
  });

  it("still routes a plain payment-reminder utterance through the existing email flow, unaffected by the new WhatsApp pattern", async () => {
    mocks.requestPaymentReminder.mockResolvedValue({ status: "NO_OUTSTANDING_BALANCE" });
    const result = await paymentReminderConversationExtension.execute("Atlas İnşaat'a ödeme hatırlatması gönder");
    expect(mocks.requestPaymentReminder).toHaveBeenCalled();
    expect(mocks.listCustomers).not.toHaveBeenCalled();
    expect(mocks.windowOpen).not.toHaveBeenCalled();
    expect(result.handoff?.outcomeCode).toBe("PAYMENT_REMINDER_NO_OUTSTANDING_BALANCE");
  });
});
