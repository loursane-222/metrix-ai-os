import { describe, expect, it } from "vitest";
import { resolveCustomerCreateSemanticIntent } from "../customer-create-semantic-intent";

const collecting = { lifecycle: "COLLECTING" as const, fields: {}, missingFields: ["displayName" as const] };
const ready = { lifecycle: "READY" as const, fields: { displayName: "Atlas Yapı" }, missingFields: [] };

describe("customer create semantic intent authority", () => {
  it.each([
    "Yeni müşteri aç.", "Yeni müşteri oluştur!", "Yeni müşteri kaydet.", "Bir müşteri ekleyelim.",
    "Yeni müşteri kaydı aç. Firma adı Experience Runtime Test, telefon 0555 111 22 33.",
    "Yeni cari aç", "Yeni firma kaydı başlat.", "Bir müşteri kartı oluşturalım.", "Yeni bayi tanımlayalım.",
    "Bir şirketi sisteme ekleyelim.",
  ])("resolves create workflow paraphrases as OPEN without a premature commit: %s", (utterance) => {
    expect(resolveCustomerCreateSemanticIntent(utterance, null, false)).toMatchObject({ operation: "CREATE", stage: "OPEN", explicitCommit: false, confidence: "HIGH" });
  });

  // Regression: the trailing boundary after the create verb used to be an
  // explicit [.,!?] class (or, briefly during a fix attempt, \b — which
  // never matches right after a Turkish letter like ç/ş/ğ/ı/ö/ü under JS's
  // ASCII-only \w). A colon — a completely natural way to introduce details
  // ("Yeni müşteri oluştur: İsim, telefon ...") — fell through both, so the
  // whole conversation-extension field-extraction pipeline was silently
  // skipped in production (customer-create-conversation-planner.ts's
  // deterministic pre-filter returned NOT_CUSTOMER_CREATE), leaving only
  // the field-less Business Navigation fallback to open an empty surface.
  it.each([
    "Yeni müşteri oluştur: Atlas Yapı, telefon 5551234567",
    "Yeni müşteri aç: Atlas Yapı",
    "Yeni cari ekle: Atlas Yapı",
  ])("resolves create verb followed by a colon-introduced detail list (production regression): %s", (utterance) => {
    expect(resolveCustomerCreateSemanticIntent(utterance, null, false)).toMatchObject({ operation: "CREATE", explicitCommit: false, confidence: "HIGH" });
  });
  // Production regression (METRIX_WORKSPACE_CANONICAL_OPERATION_HANDOFF.md
  // §4.2): "kaydı yap" is a completely natural way to say "kaydet", but
  // createConcept's verb enumeration only recognized "kaydet" — even though
  // createWorkflowEvidence already correctly recognized "yeni müşteri" via
  // newEntityConcept, a redundant second conjunct required createConcept to
  // ALSO match, silently rejecting the utterance and leaving the real
  // coordinator/planner never invoked at all (an empty Customer Create
  // Surface, no field projection, no pending operation).
  it.each([
    "yeni müşteri kaydı yap. ismi selvi mermer, izmir-karabağlar, yetkili ebru aydın, telefon 05399854475",
    "Yeni müşteri kaydı yap.",
  ])("resolves 'kaydı yap' as a create verb form (production regression): %s", (utterance) => {
    expect(resolveCustomerCreateSemanticIntent(utterance, null, false)).toMatchObject({ operation: "CREATE" });
  });

  it("owns an explicitly created named customer without treating ambiguous open as create", () => {
    expect(resolveCustomerCreateSemanticIntent("Atlas müşterisini oluşturalım. Firma adı Atlas.", null, true)).toMatchObject({ operation: "CREATE", stage: "OPEN_AND_PROVIDE_FIELDS" });
    expect(resolveCustomerCreateSemanticIntent("Atlas müşterisini aç.", null, false)).toMatchObject({ operation: "UNKNOWN" });
  });
  it("resolves the possessive-accusative named-entity create phrasing (production regression): Atlas müşterisini oluştur.", () => {
    expect(resolveCustomerCreateSemanticIntent("Atlas müşterisini oluştur.", null, false)).toMatchObject({ operation: "CREATE", stage: "OPEN", entityReference: "Atlas" });
  });
  it("accepts approval only while a create workflow is active", () => {
    const pending = { lifecycle: "READY" as const, fields: { displayName: "Atlas" }, missingFields: [] };
    expect(resolveCustomerCreateSemanticIntent("Onaylıyorum", pending, false)).toMatchObject({ operation: "CREATE", stage: "COMMIT", explicitCommit: true });
    expect(resolveCustomerCreateSemanticIntent("Onaylıyorum", null, false)).toMatchObject({ operation: "UNKNOWN", explicitCommit: false });
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

  it.each([
    "Atlas müşterisini aç.",
    "Atlas müşterisini göster.",
    "Atlas müşterisini düzenle.",
  ])("leaves existing-customer navigation to canonical conversation understanding: %s", (utterance) => {
    expect(resolveCustomerCreateSemanticIntent(utterance, null, false)).toMatchObject({ operation: "UNKNOWN", stage: "UNKNOWN" });
  });

  it("separates enrichment and help from create", () => {
    expect(resolveCustomerCreateSemanticIntent("Atlas artık euro ile çalışıyor.", collecting, true)).toMatchObject({ operation: "ENRICH", stage: "PROVIDE_FIELDS" });
    expect(resolveCustomerCreateSemanticIntent("Burada ne söylemeliyim?", collecting, false)).toMatchObject({ operation: "QUERY", stage: "MISSING_FIELDS_QUERY" });
  });
});
