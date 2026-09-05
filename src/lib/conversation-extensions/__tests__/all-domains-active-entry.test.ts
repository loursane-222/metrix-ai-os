import { afterEach, describe, expect, it, vi } from "vitest";
import { executeActiveConversationExtension, resetConversationExtensionTurnCacheForTests } from "../active-conversation-extension";

describe("conversation extensions: real active entry coverage", () => {
  afterEach(() => {
    resetConversationExtensionTurnCacheForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Residual Capability Parity Migration: calendar-management is narrowed
  // to ONLY its "takvimi göster" navigation branch — event-create and
  // availability-query are retired from the extension layer (see
  // calendar-semantic-tools.test.ts for the moved deterministic weekday
  // math and availability tool, now Agent-owned). Both utterance families
  // now fall through to NOT_HANDLED here, reaching the Executive Agent.
  it.each([
    "pazartesi saat 18:30'da Haftalık değerlendirme ekle",
    "salı saat 18:30'da Haftalık değerlendirme ekle",
  ])("no longer claims a calendar create utterance ('%s') at the extension layer — falls through to the Executive Agent", async (utterance) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `calendar-create-retired-${utterance}` });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
  });

  it("no longer claims a calendar availability query at the extension layer — falls through to the Executive Agent", async () => {
    vi.stubGlobal("window", { location: { pathname: "/metrix" } });
    const result = await executeActiveConversationExtension({ utterance: "Ayşe Yılmaz şu an müsait mi?", source: "written", turnKey: "calendar-availability-retired" });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
  });

  it("still routes 'takvimi göster' as a fast navigation through the real active entry", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance: "takvimi göster", source: "written", turnKey: "calendar-show-still-active" });
    expect(result).toMatchObject({ status: "HANDOFF", handoff: { domain: "calendar", operation: "NAVIGATE", outcomeCode: "CALENDAR_OPENED", navigationRequested: true, navigationStatus: "COMPLETED" } });
  });

  it.each([
    ["customer", "customers", "Atlas müşterisini pasife al"],
    ["offer", "quotes", "Atlas teklifini aç"],
    ["calendar", "calendar", "takvimi göster"],
    ["supplier", "suppliers", "yeni tedarikçi ekle"],
    ["order", "orders", "siparişlerimizi göster"],
    ["delivery", "deliveries", "irsaliyeleri göster"],
    ["stock", "stocks", "stoku göster"],
    ["product", "products", "urunleri goster"],
    ["accounting", "accounting", "nakit durumumuz ne"],
    ["finance", "finance", "finansal durumu göster"],
    ["team", "team", "ekibi göster"],
    ["goal", "goals", "hedeflerimizi goster"],
  ])("routes the obvious %s command through executeActiveConversationExtension", async (domain, expectedDomain, utterance) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    // outcome: NOT_HANDLED covers the generic orchestration fallback
    // (requestOrchestrationPlanAndRun) for the cases below whose real
    // entity resolution comes back NOT_FOUND against this deliberately
    // empty customer list (Atlas isn't in it) — the shared arbitration rule
    // in active-conversation-extension.ts now keeps trying subsequent
    // extensions (including this fallback) after such a NOT_FOUND
    // clarification, only falling back to it once nothing else claims the
    // turn either; the fallback must decline cleanly, not receive a
    // response shape it doesn't recognize.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { customers: [], count: 0, outcome: { status: "NOT_HANDLED" } } }) }));

    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `active-${domain}` });

    expect(result.status).toBe("HANDOFF");
    expect(result.handoff?.domain).toBe(expectedDomain);
  });

  it("routes the supplier alternative command through the real active entry", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string) => Promise.resolve({ ok: true, json: async () => input.startsWith("/api/products")
      ? ({ ok: true, data: { products: [{ id: "product-1", name: "Çelik" }] } })
      : ({ ok: true, data: { alternatives: [{ displayName: "Alternatif Metal" }] } }) })));
    const result = await executeActiveConversationExtension({ utterance: "Çelik için başka tedarikçi öner", source: "written", turnKey: "supplier-alternative" });
    expect(result).toMatchObject({ status: "HANDOFF", handoff: { domain: "suppliers", outcomeCode: "ALTERNATIVE_SUPPLIERS_FOUND", candidateNames: ["Alternatif Metal"] } });
  });

  it.each(["+90 532-111-22-33", "0532 111 22 33", "532 111 22 33"])("normalizes '%s' and opens the resolved offer in WhatsApp", async (phone) => {
    // window.open is called synchronously (before any await) to open a
    // blank tab whose location is set once the real wa.me URL is known —
    // see navigateWhatsAppComposeTab. A real browser's open() returns a
    // Window with a settable .location.href; this fake must too.
    const fakeTab = { closed: false, close: vi.fn(), location: { href: "" } };
    const open = vi.fn().mockReturnValue(fakeTab);
    vi.stubGlobal("window", { location: { pathname: "/" }, open });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string) => Promise.resolve({
      ok: true,
      json: async () => input === "/api/customers"
        ? { ok: true, data: { customers: [{ id: "customer-1", displayName: "Atlas", legalName: null, phone, email: null, cariKodu: null, taxNumber: null }] } }
        : input === "/api/quotes"
          ? { ok: true, data: { quotes: [{ id: "quote-1", customerId: "customer-1", title: "Atlas Dönüşüm Teklifi", amount: "12500", currency: "TRY", updatedAt: "2026-08-09T12:00:00.000Z" }] } }
          : { ok: true, data: { publicUrl: "https://metrixgm.com/teklif/public-token", organizationName: "METRIX Test" } },
    })));

    const result = await executeActiveConversationExtension({ utterance: "Atlas teklifini whatsapp'tan gönder", source: "written", turnKey: "offer-whatsapp" });

    expect(result).toMatchObject({ status: "HANDOFF", handoff: { domain: "quotes", outcomeCode: "OFFER_WHATSAPP_READY", entityResolution: "RESOLVED" } });
    expect(open).toHaveBeenCalledTimes(1);
    expect(fakeTab.close).not.toHaveBeenCalled();
    const url = fakeTab.location.href;
    expect(url).toMatch(/^https:\/\/wa\.me\/905321112233\?text=/u);
    expect(decodeURIComponent(new URL(url).searchParams.get("text") ?? "")).toContain("https://metrixgm.com/teklif/public-token");
    expect(decodeURIComponent(new URL(url).searchParams.get("text") ?? "")).toContain("Atlas Dönüşüm Teklifi");
  });

  it("requests clarification instead of composing a WhatsApp message for an unrecognized phone format", async () => {
    const fakeTab = { closed: false, close: vi.fn(), location: { href: "" } };
    const open = vi.fn().mockReturnValue(fakeTab);
    vi.stubGlobal("window", { location: { pathname: "/" }, open });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { customers: [{ id: "customer-1", displayName: "Atlas", legalName: null, phone: "12345", email: null, cariKodu: null, taxNumber: null }] } }) }));

    const result = await executeActiveConversationExtension({ utterance: "Atlas teklifini gönder", source: "written", turnKey: "offer-whatsapp-invalid-phone" });

    expect(result).toMatchObject({ status: "HANDOFF", handoff: { domain: "quotes", outcomeCode: "OFFER_WHATSAPP_PHONE_MISSING", resultStatus: "CLARIFICATION_REQUIRED" } });
    // The early-opened tab is closed again, never navigated to a wa.me URL.
    expect(fakeTab.close).toHaveBeenCalledTimes(1);
    expect(fakeTab.location.href).toBe("");
  });

  it.each([
    ["SIP-0042 karşılama durumu ne", "ORDER_FULFILLMENT_FOUND"],
    ["SIP-0042 önceliği ne", "ORDER_PRIORITY_FOUND"],
    ["SIP-0042 rezervasyon durumu", "ORDER_RESERVATION_FOUND"],
  ])("routes order intelligence query '%s' through the real active entry", async (utterance, outcomeCode) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { orders: [{ id: "order-42", orderNumber: "SIP-0042", priorityLabel: "Kritik", items: [{ id: "item-1", name: "Çelik", quantity: "10" }] }], count: 1 } }) }));
    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `order-intelligence-${outcomeCode}` });
    expect(result).toMatchObject({ status: "HANDOFF", handoff: { domain: "orders", outcomeCode, entityResolution: "RESOLVED" } });
  });

  it("queries the canonical delivery commitment rate through the real active entry", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { rate: 96, onTimeDeliveryRate: "%96", status: "AVAILABLE" } }) }));
    const result = await executeActiveConversationExtension({ utterance: "zamanında teslim oranımız ne", source: "written", turnKey: "order-commitment" });
    expect(result).toMatchObject({ status: "HANDOFF", handoff: { outcomeCode: "DELIVERY_COMMITMENT_RATE_FOUND", candidateNames: ["%96"] } });
  });

  it.each([
    ["SIP-0042 siparişinin miktarını 12 olarak değiştir", "ORDER_REVISION_RECORDED"],
    ["SIP-0042 tedarik gecikmesi yaşıyor", "ORDER_EXCEPTION_RECORDED"],
  ])("records order operation '%s' through the real active entry", async (utterance, outcomeCode) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string) => Promise.resolve({
      ok: true,
      json: async () => input === "/api/orders"
        ? { ok: true, data: { orders: [{ id: "order-42", orderNumber: "SIP-0042", priorityLabel: "Yüksek", items: [{ id: "item-1", name: "Çelik", quantity: "10" }] }], count: 1 } }
        : { ok: true, data: { revision: { id: "revision-1" }, exception: { id: "exception-1" } } },
    })));
    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `order-write-${outcomeCode}` });
    expect(result).toMatchObject({ status: "HANDOFF", handoff: { domain: "orders", outcomeCode, mutationPerformed: true } });
  });

  // Residual Capability Parity Migration: delivery-management is narrowed
  // to ONLY its list/create-form/open-by-reference navigation branches —
  // integrity/performance queries and proof/exception writes are retired
  // (see residual-capability-tools.test.ts for the moved read tools and
  // delivery-record-proof-handler.test.ts/delivery-add-exception-handler.test.ts
  // for the moved canonical actions). All these utterances now fall
  // through to NOT_HANDLED, reaching the Executive Agent.
  it.each([
    "IRS-0042 sevkiyat bütünlüğü nasıl",
    "hangi taşıyıcı en iyi performans gösteriyor",
    "teslim performansımız nasıl",
    "IRS-0042 teslimata teslim kanıtı ekle: KOD-42",
    "IRS-0042 teslimat müşteri adreste yoktu",
  ])("no longer claims a delivery query/write utterance ('%s') at the extension layer — falls through to the Executive Agent", async (utterance) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `delivery-retired-${utterance}` });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
  });

  it.each([
    ["stok sağlığını göster", "/api/stock/intelligence/health", "STOCK_HEALTH_FOUND"],
    ["risk sinyallerimiz ne", "/api/stock/intelligence/executive", "STOCK_EXECUTIVE_SIGNALS_FOUND"],
    ["sayım sapmalarını göster", "/api/stock/counts", "STOCK_VARIANCES_FOUND"],
  ])("routes stock intelligence query '%s' through the real active entry", async (utterance, endpoint, outcomeCode) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string) => Promise.resolve({ ok: true, json: async () => input === endpoint
      ? endpoint.endsWith("health")
        ? { ok: true, data: { status: "AVAILABLE", healthSummary: "Kritik stok 1.", categories: {} } }
        : endpoint.endsWith("executive")
          ? { ok: true, data: { status: "AVAILABLE", healthSummary: "Kritik stok 1.", riskSignalCount: 1, opportunitySignalCount: 0, operationalSignalCount: 0, openVarianceCount: 0 } }
          : { ok: true, data: { records: [{ id: "count-1", stock: { productService: { name: "Çelik" } } }], count: 1 } }
      : { ok: false } })));
    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `stock-intelligence-${outcomeCode}` });
    expect(result).toMatchObject({ status: "HANDOFF", handoff: { domain: "stocks", outcomeCode } });
  });

  it("records a diacritic-tolerant physical count through the real active entry", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string) => Promise.resolve({ ok: true, json: async () => input === "/api/stock"
      ? { ok: true, data: { stocks: [{ id: "stock-1", productService: { id: "product-1", name: "Çelik", type: "PRODUCT", unit: "adet" }, productServiceId: "product-1", warehouse: { id: "warehouse-1", name: "Ana Depo", code: "ANA" }, warehouseId: "warehouse-1" }], count: 1 } }
      : { ok: true, data: { record: { id: "count-1", varianceQuantity: "-2" } } } })));
    const result = await executeActiveConversationExtension({ utterance: "Ana Depo'da Celik sayimi yaptim, 8 cikti", source: "written", turnKey: "stock-count" });
    expect(result).toMatchObject({ status: "HANDOFF", handoff: { domain: "stocks", outcomeCode: "STOCK_VARIANCE_RECORDED", mutationPerformed: true } });
  });

  // Residual Capability Parity Migration: team-management is narrowed to
  // ONLY its "ekibi göster" navigation branch — invite/role-change/toggle
  // are retired from the extension layer (see
  // organization-member-create-handler.test.ts and
  // organization-member-update-handler.test.ts for the moved capability,
  // now Agent-owned via organization_member.create/update). Both utterance
  // families now fall through to NOT_HANDLED here, reaching the Executive
  // Agent.
  it("no longer claims a team invite utterance at the extension layer — falls through to the Executive Agent", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance: "ayse@example.com'u yonetici olarak davet et", source: "written", turnKey: "team-invite-retired" });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
  });

  it.each([
    "Ayse'nin rolunu ekip lideri yap",
    "ayse@example.com'u devre disi birak",
    "ayse@example.com'u etkinlestir",
  ])("no longer claims a team update utterance ('%s') at the extension layer — falls through to the Executive Agent", async (utterance) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `team-update-retired-${utterance}` });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
  });

  // Residual Capability Parity Migration: invoice-management is fully
  // retired — invoice.create was already a complete canonical action, and
  // the one gap (inferring a customer's own quote without naming it) is
  // closed by find_customer_open_quote (see residual-capability-tools.test.ts).
  it("no longer claims an invoice-create utterance at the extension layer — falls through to the Executive Agent", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance: "Atlas için 100 TL fatura kes", source: "written", turnKey: "invoice-create-retired" });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
  });

  // Residual Capability Parity Migration: payment-management is fully
  // retired — payment.create was already a complete canonical action, and
  // the relative due-date math moved to resolve_relative_due_date (see
  // residual-capability-tools.test.ts).
  it("no longer claims a payment-create utterance at the extension layer — falls through to the Executive Agent", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance: "Atlas için 100 TL tahsilat kaydet", source: "written", turnKey: "payment-create-retired" });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
  });

  // Residual Capability Parity Migration: task-management is now retired
  // from active dispatch (task.create Action Registry parity already
  // existed; the extension had no deterministic sub-logic of its own — see
  // conversation-extension-ownership-registry.ts). A cold task-create
  // utterance no longer gets a direct handoff here; it falls through to
  // NOT_HANDLED, reaching the Executive Agent instead.
  it("no longer claims a cold task-create utterance at the extension layer — falls through to the Executive Agent", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance: "yeni görev oluştur: haftalık raporu kontrol et", source: "written", turnKey: "task-create-retired" });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
  });
});
