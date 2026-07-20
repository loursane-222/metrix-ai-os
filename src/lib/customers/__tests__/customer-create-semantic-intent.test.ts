import { describe, expect, it } from "vitest";
import { resolveCustomerCreateSemanticIntent } from "../customer-create-semantic-intent";

const collecting = { lifecycle: "COLLECTING" as const, fields: {}, missingFields: ["displayName" as const] };
const ready = { lifecycle: "READY" as const, fields: { displayName: "Atlas Yapı" }, missingFields: [] };

describe("customer create semantic intent authority", () => {
  it.each([
    "Yeni müşteri aç.", "Yeni müşteri oluştur!", "Yeni müşteri kaydet.", "Bir müşteri ekleyelim.",
    "Yeni cari aç", "Yeni firma kaydı başlat.", "Bir müşteri kartı oluşturalım.", "Yeni bayi tanımlayalım.",
    "Bir şirketi sisteme ekleyelim.",
  ])("resolves create workflow paraphrases as OPEN without a premature commit: %s", (utterance) => {
    expect(resolveCustomerCreateSemanticIntent(utterance, null, false)).toMatchObject({ operation: "CREATE", stage: "OPEN", explicitCommit: false, confidence: "HIGH" });
  });

  it.each([
    ["Atlas Yapı’yı sisteme ekle.", "Atlas Yapı"],
    ["Atlas Yapı için müşteri kartı aç.", "Atlas Yapı"],
    ["Atlas Yapı’yı müşteri olarak tanımla.", "Atlas Yapı"],
    ["Atlas Yapı artık müşterimiz.", "Atlas Yapı"],
    ["Atlas Yapı’yı yeni cari olarak kaydet.", "Atlas Yapı"],
  ])("resolves named entity onboarding: %s", (utterance, entityReference) => {
    expect(resolveCustomerCreateSemanticIntent(utterance, null, true)).toMatchObject({ operation: "CREATE", entityReference, explicitCommit: expect.any(Boolean) });
  });

  it("uses active workflow and payload presence for OPEN versus COMMIT precedence", () => {
    expect(resolveCustomerCreateSemanticIntent("Yeni müşteri kaydet.", null, false)).toMatchObject({ stage: "OPEN", explicitCommit: false });
    expect(resolveCustomerCreateSemanticIntent("Kaydet.", ready, false)).toMatchObject({ stage: "COMMIT", explicitCommit: true });
    expect(resolveCustomerCreateSemanticIntent("Kaydet.", null, false)).toMatchObject({ operation: "UNKNOWN", explicitCommit: false });
    expect(resolveCustomerCreateSemanticIntent("Atlas Yapı’yı yeni müşteri olarak kaydet.", null, true)).toMatchObject({ stage: "OPEN_PROVIDE_AND_COMMIT", explicitCommit: true });
  });

  it.each([
    "Yeni müşteri kazanmak için kampanya hazırlayalım.", "Müşteri kaybetme oranımız nedir?", "Atlas müşterimiz mi?",
    "Yeni müşteri sayısını raporla.", "Müşteriye kaydettiğimiz notu göster.", "Cari açık ne demek?",
    "Yeni müşteriler neden gelmiyor?", "Müşteri kaydını kim açtı?", "Kaydet butonu nerede?", "Bu konuşmayı kaydet.",
  ])("does not claim negative customer-create intent: %s", (utterance) => {
    expect(resolveCustomerCreateSemanticIntent(utterance, null, false).operation).toBe("UNKNOWN");
  });

  it("separates enrichment and help from create", () => {
    expect(resolveCustomerCreateSemanticIntent("Atlas artık euro ile çalışıyor.", collecting, true)).toMatchObject({ operation: "ENRICH", stage: "PROVIDE_FIELDS" });
    expect(resolveCustomerCreateSemanticIntent("Burada ne söylemeliyim?", collecting, false)).toMatchObject({ operation: "QUERY", stage: "MISSING_FIELDS_QUERY" });
  });
});
