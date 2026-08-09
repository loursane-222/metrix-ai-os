import { afterEach, describe, expect, it, vi } from "vitest";
import { executeActiveConversationExtension, resetConversationExtensionTurnCacheForTests } from "../active-conversation-extension";

describe("conversation extensions: real active entry coverage", () => {
  afterEach(() => {
    resetConversationExtensionTurnCacheForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ["customer", "customers", "Atlas müşterisini pasife al"],
    ["offer", "quotes", "Atlas teklifini aç"],
    ["task", "tasks", "yeni görev oluştur: haftalık raporu kontrol et"],
    ["payment", "payments", "Atlas için 100 TL tahsilat kaydet"],
    ["invoice", "invoices", "Atlas için 100 TL fatura kes"],
    ["supplier", "suppliers", "yeni tedarikçi ekle"],
    ["order", "orders", "siparişlerimizi göster"],
    ["delivery", "deliveries", "irsaliyeleri göster"],
    ["stock", "stocks", "stoku göster"],
  ])("routes the obvious %s command through executeActiveConversationExtension", async (domain, expectedDomain, utterance) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { customers: [], count: 0 } }) }));

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

  it("routes delivery integrity through the real active entry", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data: { deliveries: [{ id: "delivery-42", deliveryNumber: "IRS-0042", integritySummary: "Kısmi sevkiyat" }], count: 1 } }) }));
    const result = await executeActiveConversationExtension({ utterance: "IRS-0042 sevkiyat bütünlüğü nasıl", source: "written", turnKey: "delivery-integrity" });
    expect(result).toMatchObject({ status: "HANDOFF", handoff: { domain: "deliveries", outcomeCode: "SHIPMENT_INTEGRITY_FOUND", entityResolution: "RESOLVED" } });
  });

  it.each([
    ["hangi taşıyıcı en iyi performans gösteriyor", "/api/deliveries/intelligence/carriers", "CARRIER_PERFORMANCE_FOUND"],
    ["teslim performansımız nasıl", "/api/deliveries/intelligence/performance", "DELIVERY_PERFORMANCE_FOUND"],
  ])("routes delivery performance query '%s' through the real active entry", async (utterance, endpoint, outcomeCode) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string) => Promise.resolve({ ok: true, json: async () => input === endpoint
      ? { ok: true, data: endpoint.endsWith("carriers") ? { status: "AVAILABLE", carrierPerformanceSummary: "Hızlı Kargo", carriers: [{ carrier: "Hızlı Kargo", onTimeDeliveryRate: "%100", damageRate: "%0", averageDeliveryHours: 5 }] } : { status: "AVAILABLE", onTimeDeliveryRate: "%80", firstAttemptSuccessRate: "%75", damageRate: "%10" } }
      : { ok: false } })));
    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `delivery-performance-${outcomeCode}` });
    expect(result).toMatchObject({ status: "HANDOFF", handoff: { domain: "deliveries", outcomeCode } });
  });

  it.each([
    ["IRS-0042 teslimata teslim kanıtı ekle: KOD-42", "DELIVERY_PROOF_RECORDED"],
    ["IRS-0042 teslimat müşteri adreste yoktu", "DELIVERY_EXCEPTION_RECORDED"],
  ])("records delivery operation '%s' through the real active entry", async (utterance, outcomeCode) => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string) => Promise.resolve({ ok: true, json: async () => input === "/api/deliveries"
      ? { ok: true, data: { deliveries: [{ id: "delivery-42", deliveryNumber: "IRS-0042" }], count: 1 } }
      : { ok: true, data: { delivery: { id: "delivery-42" }, exception: { id: "exception-42" } } } })));
    const result = await executeActiveConversationExtension({ utterance, source: "written", turnKey: `delivery-write-${outcomeCode}` });
    expect(result).toMatchObject({ status: "HANDOFF", handoff: { domain: "deliveries", outcomeCode, mutationPerformed: true } });
  });
});
