import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  listQuotes: vi.fn(),
  windowOpen: vi.fn(),
}));

vi.mock("@/lib/customers/customers-client", () => ({ listCustomers: mocks.listCustomers }));
vi.mock("@/lib/offers/quotes-client", () => ({ listQuotes: mocks.listQuotes, createOffer: vi.fn() }));

const { offerManagementConversationExtension } = await import("../offer-management-conversation-extension");

const customer = { id: "c-1", displayName: "Atlas İnşaat", legalName: null, phone: "0532 111 22 33", email: null, cariKodu: null, taxNumber: null };
const quote = { id: "q-1", organizationId: "org-1", customerId: "c-1", customerName: "Atlas İnşaat", title: "Atlas Teklifi", amount: "10000", currency: "TRY", status: "SENT", updatedAt: "2026-08-24T00:00:00Z" };

function mockFetchOnce(status: number, body: unknown): void {
  global.fetch = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as typeof fetch;
}

// Same early-open/close-on-failure/navigate-on-success contract as
// payment-reminder-whatsapp-statement.test.ts — both extensions share
// openWhatsAppComposeTab/navigateWhatsAppComposeTab.
function makeFakeTab() {
  return { closed: false, close: vi.fn(function (this: { closed: boolean }) { this.closed = true; }), location: { href: "" } };
}

describe("offer-management-conversation-extension — quote WhatsApp send", () => {
  let fakeTab: ReturnType<typeof makeFakeTab>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeTab = makeFakeTab();
    mocks.windowOpen.mockReturnValue(fakeTab);
    (globalThis as { window?: unknown }).window = { open: mocks.windowOpen, location: { pathname: "/metrix" } };
  });

  it("closes the early-opened tab without navigating when the customer has no usable phone", async () => {
    mocks.listCustomers.mockResolvedValue({ ok: true, data: { customers: [{ ...customer, phone: null }] } });
    const result = await offerManagementConversationExtension.execute("Atlas İnşaat teklifini gönder");
    expect(result.handoff?.outcomeCode).toBe("OFFER_WHATSAPP_PHONE_MISSING");
    expect(mocks.windowOpen).toHaveBeenCalledTimes(1);
    expect(fakeTab.close).toHaveBeenCalledTimes(1);
    expect(fakeTab.location.href).toBe("");
  });

  it("navigates the early-opened tab to a real wa.me link with the quote's public link — never opening a second window", async () => {
    mocks.listCustomers.mockResolvedValue({ ok: true, data: { customers: [customer] } });
    mocks.listQuotes.mockResolvedValue({ ok: true, data: { quotes: [quote] } });
    mockFetchOnce(200, { ok: true, data: { publicUrl: "https://metrix.test/teklif/tok123", organizationName: "METRIX Demo" } });

    const result = await offerManagementConversationExtension.execute("Atlas İnşaat teklifini gönder");

    expect(result.handoff?.outcomeCode).toBe("OFFER_WHATSAPP_READY");
    expect(result.handoff?.mutationPerformed).toBe(true);
    expect(mocks.windowOpen).toHaveBeenCalledTimes(1);
    expect(fakeTab.close).not.toHaveBeenCalled();
    expect(fakeTab.location.href).toContain("https://wa.me/905321112233?text=");
    expect(decodeURIComponent(fakeTab.location.href)).toContain("https://metrix.test/teklif/tok123");
  });

  it("closes the early-opened tab and reports a failure outcome when the public-link request fails", async () => {
    mocks.listCustomers.mockResolvedValue({ ok: true, data: { customers: [customer] } });
    mocks.listQuotes.mockResolvedValue({ ok: true, data: { quotes: [quote] } });
    mockFetchOnce(500, { ok: false });

    const result = await offerManagementConversationExtension.execute("Atlas İnşaat teklifini gönder");

    expect(result.handoff?.outcomeCode).toBe("OFFER_WHATSAPP_LINK_FAILED");
    expect(fakeTab.close).toHaveBeenCalledTimes(1);
    expect(fakeTab.location.href).toBe("");
  });
});
