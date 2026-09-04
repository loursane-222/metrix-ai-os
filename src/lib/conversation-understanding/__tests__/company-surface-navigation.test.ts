import { describe, expect, it } from "vitest";
import { buildCompanySurfaceNavigationUnderstanding, recognizeCompanySurfaceNavigation } from "../company-surface-navigation";

/**
 * Company Integrations Navigation Determinism Fix. This is the exact
 * production failure: "Şirketimin entegrasyonlarını aç." was still
 * mis-classified after the LLM few-shot-only fix (commit 705a9d5) shipped —
 * the model is not on the critical path for this intent class anymore, so
 * these tests exercise the real, executable recognizer with the exact live
 * phrases, not a hand-built ConversationUnderstanding fixture.
 */
describe("recognizeCompanySurfaceNavigation — deterministic, zero-LLM-call", () => {
  it.each([
    "Şirketimin entegrasyonlarını aç.",
    "Entegrasyonları aç.",
    "Bağlantılarımı göster.",
    "Takvim entegrasyonlarını aç.",
    "iCloud takvimimi bağlamak istiyorum.",
    "Google bağlantımı göster.",
    "Entegrasyon ayarlarını göster.",
    "Google ve iCloud bağlantılarımı göster.",
  ])("%s -> integrations section, real production phrasing", (message) => {
    expect(recognizeCompanySurfaceNavigation(message)).toEqual({ companySection: "integrations" });
  });

  it.each([
    "Şirketimi aç.",
    "Şirket bilgilerini aç.",
    "Şirketimin profilini göster.",
  ])("%s -> plain company.root, no section (do not make every company phrase integrations)", (message) => {
    expect(recognizeCompanySurfaceNavigation(message)).toEqual({ companySection: null });
  });

  it.each([
    "Şirketimde hangi entegrasyonları kullanmalıyım?",
    "Entegrasyonları nasıl kurmalıyım?",
    "iCloud entegrasyonu önerir misin?",
  ])("%s -> null, advisory/informational shape must never auto-open a surface", (message) => {
    expect(recognizeCompanySurfaceNavigation(message)).toBeNull();
  });

  it.each([
    "Takvimi aç.",
    "Bugünkü programımı göster.",
    "Atlas İnşaat hakkında bilgi ver.",
    "Merhaba, nasılsın?",
    "Şirketimiz bu ay nasıl gidiyor?",
    "Tekliflerimi göster.",
  ])("%s -> null, preserves Calendar/Customer/general-chat/informational turns", (message) => {
    expect(recognizeCompanySurfaceNavigation(message)).toBeNull();
  });

  it("requires an actual company/integration signal — a bare open/show verb alone never matches", () => {
    expect(recognizeCompanySurfaceNavigation("Aç.")).toBeNull();
    expect(recognizeCompanySurfaceNavigation("Göster bana.")).toBeNull();
  });
});

describe("buildCompanySurfaceNavigationUnderstanding", () => {
  it("produces a high-confidence, no-clarification NAVIGATE request with companySection preserved", () => {
    const understanding = buildCompanySurfaceNavigationUnderstanding({ companySection: "integrations" });
    expect(understanding.shouldAskClarification).toBe(false);
    expect(understanding.confidence).toBe("high");
    expect(understanding.businessNavigation).toEqual({ operation: "NAVIGATE", domain: "company", target: "root", entityReference: null, companySection: "integrations" });
  });

  it("carries companySection null through for a plain company-root request", () => {
    const understanding = buildCompanySurfaceNavigationUnderstanding({ companySection: null });
    expect(understanding.businessNavigation).toMatchObject({ domain: "company", target: "root", companySection: null });
  });
});
