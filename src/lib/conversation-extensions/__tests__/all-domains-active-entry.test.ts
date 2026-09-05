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

  // Final Residual Parity Closure: customer-management-conversation-
  // extension.ts is fully retired — archive-by-name (customer.archive is
  // ALREADY canonical, reachable via execute_business_action's own
  // approval flow) no longer has an extension-layer claimant. Same
  // "falls through to NOT_HANDLED" pattern as calendar-create above.
  it("no longer claims a customer-archive-by-name utterance at the extension layer — falls through to the Executive Agent", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { customers: [], count: 0 } }) }));
    const result = await executeActiveConversationExtension({ utterance: "Atlas müşterisini pasife al", source: "written", turnKey: "customer-archive-retired" });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
  });

  it.each([
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

  // Residual Capability Parity Migration: offer-management's WhatsApp-send
  // branch is retired — compose_offer_whatsapp (Agent tool) plus
  // find_customer_most_recent_quote now own it (see
  // residual-capability-tools.test.ts). Both utterance families fall
  // through to NOT_HANDLED here.
  it.each([
    "Atlas teklifini whatsapp'tan gönder",
    "Atlas teklifini gönder",
  ])("no longer claims an offer WhatsApp-send utterance ('%s') at the extension layer — falls through to the Executive Agent", async (utterance) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `offer-whatsapp-retired-${utterance}` });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
  });

  // Residual Capability Parity Migration: order-management is narrowed to
  // ONLY its list/create-form/open-by-reference navigation branches —
  // fulfillment/priority/reservation/commitment-rate queries and
  // revision/exception writes are retired (see residual-capability-tools.test.ts
  // for the moved read tools and order-revise-handler.test.ts/
  // order-add-exception-handler.test.ts for the moved canonical actions).
  it.each([
    "SIP-0042 karşılama durumu ne",
    "SIP-0042 önceliği ne",
    "SIP-0042 rezervasyon durumu",
    "zamanında teslim oranımız ne",
    "SIP-0042 siparişinin miktarını 12 olarak değiştir",
    "SIP-0042 tedarik gecikmesi yaşıyor",
  ])("no longer claims an order query/write utterance ('%s') at the extension layer — falls through to the Executive Agent", async (utterance) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `order-retired-${utterance}` });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
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

  // Residual Capability Parity Migration: stock-management is narrowed to
  // ONLY its list/operations-form/open-by-reference navigation branches —
  // health/executive-signals/pending-variances queries and physical-count
  // writes are retired (see residual-capability-tools.test.ts for the
  // moved read tools and stock-record-count-handler.test.ts/
  // stock-resolve-variance-handler.test.ts for the moved canonical
  // actions).
  it.each([
    "stok sağlığını göster",
    "risk sinyallerimiz ne",
    "sayım sapmalarını göster",
    "Ana Depo'da Celik sayimi yaptim, 8 cikti",
  ])("no longer claims a stock query/write utterance ('%s') at the extension layer — falls through to the Executive Agent", async (utterance) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `stock-retired-${utterance}` });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
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
