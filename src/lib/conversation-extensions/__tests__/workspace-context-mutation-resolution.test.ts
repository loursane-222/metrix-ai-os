import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customerAttachmentConversationCoordinator } from "@/lib/customers/customer-attachment-conversation-coordinator";
import { customerCustomFieldConversationCoordinator } from "@/lib/customers/customer-custom-field-conversation";
import type { ActiveWorkspaceContext } from "@/lib/living-workspace";
import { customerManagementConversationExtension, resetCustomerManagementConversationForTests } from "../customer-management-conversation-extension";
import { offerManagementConversationExtension } from "../offer-management-conversation-extension";
import { registerExecutiveNavigationHandler, resetConversationNavigationHandlerForTests } from "../conversation-navigation-runtime";

const context = (domain: "customer" | "offer", entityId: string): ActiveWorkspaceContext => ({
  domain,
  businessSurface: domain === "customer" ? "customer-detail" : "offer-edit",
  entityType: domain === "customer" ? "Customer" : "Quote",
  entityId,
  title: domain === "customer" ? "Müşteri" : "Teklif Düzenle",
});
const customer = (id: string, displayName = "Atlas") => ({
  id, organizationId: "org-1", displayName, legalName: null, phone: "05321112233", email: null, balanceCents: "0", currency: "TRY",
  tier: null, healthScore: null, metrixNote: null, status: "ACTIVE", cariKodu: null, taxNumber: null, taxOffice: null, mersisNo: null,
  tradeRegistryNo: null, billingAddress: null, shippingAddress: null, eInvoiceEnabled: false, eArchiveEnabled: false, source: "MANUAL",
  createdByUserId: null, updatedByUserId: null, createdAt: "2026-08-13T10:00:00.000Z", updatedAt: "2026-08-13T10:00:00.000Z",
  primaryContact: null, commercialTerms: null, customFieldValues: [],
});

function bypassEarlierCustomerStages() {
  vi.spyOn(customerAttachmentConversationCoordinator, "execute").mockResolvedValue({ handled: false, outcome: "NOT_ATTACHMENT_INTENT", message: null });
  vi.spyOn(customerCustomFieldConversationCoordinator, "execute").mockResolvedValue({ handled: false, status: "EXECUTED", message: null });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
}

describe("workspace-context mutation reference resolution", () => {
  beforeEach(() => { bypassEarlierCustomerStages(); vi.stubGlobal("window", { location: { pathname: "/", assign: vi.fn() }, open: vi.fn(), dispatchEvent: vi.fn() }); });
  afterEach(() => { resetCustomerManagementConversationForTests(); resetConversationNavigationHandlerForTests(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("archives the open customer for a deictic command without name lookup", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      requests.push(input);
      if (input === "/api/customers/open-customer") return response({ customer: customer("open-customer", "Açık Müşteri") });
      if (input === "/api/customers/open-customer/actions/archive") return response({ approval: { approvalId: "approval-1", expiresAt: "2099-01-01", customerId: "open-customer" } });
      throw new Error(`Unexpected request: ${input}`);
    }));

    const result = await customerManagementConversationExtension.execute("bu müşteriyi pasife al", "written", "archive-context", context("customer", "open-customer"));

    expect(result).toMatchObject({ status: "HANDOFF", handoff: { resultStatus: "CLARIFICATION_REQUIRED" } });
    expect(requests).toEqual(["/api/customers/open-customer", "/api/customers/open-customer/actions/archive"]);
  });

  it("does not treat a deictic customer command as a name when context is absent or from another domain", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(customerManagementConversationExtension.execute("şu müşteriyi pasife al", "written", "archive-mismatch", context("offer", "quote-1"))).resolves.toMatchObject({ status: "HANDOFF", handoff: { resultStatus: "CLARIFICATION_REQUIRED" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an explicitly named customer ahead of the open workspace", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      requests.push(input);
      if (input === "/api/customers") return response({ customers: [customer("named-customer", "Atlas")] });
      if (input === "/api/customers/named-customer/actions/archive") return response({ approval: { approvalId: "approval-2", expiresAt: "2099-01-01", customerId: "named-customer" } });
      throw new Error(`Unexpected request: ${input}`);
    }));
    await customerManagementConversationExtension.execute("Atlas müşterisini pasife al", "written", "archive-name", context("customer", "open-customer"));
    expect(requests).toEqual(["/api/customers", "/api/customers/named-customer/actions/archive"]);
  });

  it("sets a custom field on the open customer and never resolves the deictic phrase as a name", async () => {
    const requests: Array<{ path: string; body?: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ path: input, body: init?.body as string | undefined });
      if (input === "/api/customers/field-definitions") return response({ fields: [{ fieldId: "customer.custom.region", key: "custom.region", label: "Bölge", custom: true, clearable: true }] });
      if (input === "/api/customers/open-customer") return response({ customer: customer("open-customer") });
      if (input === "/api/customers/open-customer/actions/update") return response({ execution: { status: "SUCCESS" } });
      throw new Error(`Unexpected request: ${input}`);
    }));
    await customerManagementConversationExtension.execute("bu müşterinin Bölge Marmara olsun", "written", "field-context", context("customer", "open-customer"));
    expect(requests.map((item) => item.path)).toEqual(["/api/customers/field-definitions", "/api/customers/open-customer", "/api/customers/open-customer/actions/update"]);
    expect(JSON.parse(requests[2]!.body ?? "{}")).toMatchObject({ patch: { customFields: [{ definitionId: "region", value: "Marmara" }] } });
  });

  it("prefers workspace id for CLEAR, then URL id, then clarification", async () => {
    const resolvedIds: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      if (input === "/api/customers/field-definitions") return response({ fields: [{ fieldId: "customer.custom.region", key: "custom.region", label: "Bölge", custom: true, clearable: true }] });
      const match = input.match(/^\/api\/customers\/(context-id|url-id)$/u); if (match) { resolvedIds.push(match[1]!); return response({ customer: customer(match[1]!) }); }
      if (input.endsWith("/actions/update")) return response({ execution: { status: "SUCCESS" } });
      throw new Error(`Unexpected request: ${input}`);
    }));
    vi.stubGlobal("window", { location: { pathname: "/metrix/customers/url-id", assign: vi.fn() }, open: vi.fn(), dispatchEvent: vi.fn() });
    await customerManagementConversationExtension.execute("Bölgeyi temizle", "written", "clear-context", context("customer", "context-id"));
    await customerManagementConversationExtension.execute("Bölgeyi temizle", "written", "clear-url", null);
    vi.stubGlobal("window", { location: { pathname: "/", assign: vi.fn() }, open: vi.fn(), dispatchEvent: vi.fn() });
    const missing = await customerManagementConversationExtension.execute("Bölgeyi temizle", "written", "clear-missing", null);
    expect(resolvedIds).toEqual(["context-id", "url-id"]);
    expect(missing).toMatchObject({ status: "HANDOFF", handoff: { resultStatus: "CLARIFICATION_REQUIRED" } });
  });

  it("opens a deictic offer directly, rejects mismatched context, and keeps named lookup priority", async () => {
    const routes: string[] = [];
    registerExecutiveNavigationHandler((command) => routes.push(command.route));
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "/api/customers") return response({ customers: [customer("atlas-id", "Atlas")] });
      if (input === "/api/quotes") return response({ quotes: [{ id: "named-quote", customerId: "atlas-id", updatedAt: "2026-08-13T10:00:00.000Z" }] });
      throw new Error(`Unexpected request: ${input}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await offerManagementConversationExtension.execute("bu teklifi aç", "written", "offer-open", context("offer", "open-quote"));
    const mismatch = await offerManagementConversationExtension.execute("şu teklifi aç", "written", "offer-mismatch", context("customer", "customer-1"));
    await offerManagementConversationExtension.execute("Atlas teklifini aç", "written", "offer-name", context("offer", "open-quote"));
    expect(routes).toEqual(["/metrix/offers/open-quote/edit", "/metrix/offers/named-quote/edit"]);
    expect(mismatch).toMatchObject({ status: "HANDOFF", handoff: { resultStatus: "CLARIFICATION_REQUIRED" } });
    expect(fetchMock).toHaveBeenCalledWith("/api/customers", expect.anything());
  });

  it("uses customer context for deictic offer CREATE and offer context for deictic SEND", async () => {
    const routes: string[] = []; const requests: Array<{ path: string; body?: string }> = [];
    // window.open is called synchronously (before any await) to open a
    // blank tab whose location is set once the real wa.me URL is known —
    // see navigateWhatsAppComposeTab. A real browser's open() returns a
    // Window with a settable .location.href; this fake must too.
    const fakeTab = { closed: false, location: { href: "" } };
    registerExecutiveNavigationHandler((command) => routes.push(command.route));
    vi.stubGlobal("window", { location: { pathname: "/", assign: vi.fn() }, open: () => fakeTab, dispatchEvent: vi.fn() });
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
      requests.push({ path: input, body: init?.body as string | undefined });
      if (input === "/api/customers") return response({ customers: [customer("context-customer", "Bağlam Müşterisi")] });
      if (input === "/api/quotes" && init?.method === "POST") return response({ quote: { id: "created-quote" } });
      if (input === "/api/quotes") return response({ quotes: [{ id: "open-quote", customerId: "context-customer", title: "Bağlam Teklifi", amount: "1000", currency: "TRY", updatedAt: "2026-08-13T10:00:00.000Z" }] });
      if (input === "/api/quotes/open-quote/public-link") return response({ publicUrl: "https://metrixgm.com/teklif/context", organizationName: "METRIX Test" });
      throw new Error(`Unexpected request: ${input}`);
    }));

    await offerManagementConversationExtension.execute("bu müşteri için teklif hazırla", "written", "offer-create", context("customer", "context-customer"));
    await offerManagementConversationExtension.execute("bu teklifi gönder", "written", "offer-send", context("offer", "open-quote"));

    expect(routes).toEqual(["/metrix/offers/created-quote/edit"]);
    expect(JSON.parse(requests.find((item) => item.path === "/api/quotes" && item.body)?.body ?? "{}")).toMatchObject({ customerId: "context-customer" });
    expect(fakeTab.location.href).toMatch(/^https:\/\/wa\.me\/905321112233\?text=/u);
  });
});

function response(data: unknown): Response {
  return { ok: true, json: async () => ({ ok: true, data }) } as Response;
}
