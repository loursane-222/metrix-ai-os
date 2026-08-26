import { describe, expect, it } from "vitest";
import { classifyManagerAdvice } from "../manager-advice-classifier.service";
import { buildManagerAdviceAdvisoryPrompt } from "../manager-advice-advisory-prompt.service";
import type { ManagerAdviceAugmentationContext } from "../manager-advice-augmentation.types";

// Regression: a bare mention of a generic domain noun that's also one of
// METRIX's own module names ("fiyat"/pricing, "müşteri"/customer) used to
// classify HIGH confidence purely on the word appearing, with no actual
// decision-shaped signal behind it. That let the PRICING/SALES
// category-specific canned risk sentences (manager-advice-guidance.service.ts's
// CATEGORY_RISKS, injected via buildManagerAdviceAdvisoryPrompt) leak into
// completely routine turns — the same leak pattern already documented for
// ai-general-manager-brief.service.ts's fixed sentences (a "tahsilat ve nakit
// riski..." sentence appearing in an unrelated closing turn).
describe("manager advice classifier — generic-noun false positives", () => {
  it("does not classify a routine price lookup/update as HIGH-confidence PRICING", () => {
    expect(classifyManagerAdvice({ message: "fiyatı güncelle" })).toEqual({ category: "PRICING", confidence: "MEDIUM" });
    expect(classifyManagerAdvice({ message: "fiyat listesini göster" })).toEqual({ category: "PRICING", confidence: "MEDIUM" });
  });

  it("still classifies a real pricing-decision signal as HIGH-confidence PRICING", () => {
    expect(classifyManagerAdvice({ message: "müşteri fiyatı yüksek buldu" })).toEqual({ category: "PRICING", confidence: "HIGH" });
    expect(classifyManagerAdvice({ message: "indirim istiyor" })).toEqual({ category: "PRICING", confidence: "HIGH" });
  });

  it("does not classify a routine customer-creation request as HIGH-confidence SALES", () => {
    expect(classifyManagerAdvice({ message: "yeni müşteri ekle" })).toEqual({ category: "SALES", confidence: "MEDIUM" });
  });

  it("still classifies a real sales-decision signal as HIGH-confidence SALES", () => {
    expect(classifyManagerAdvice({ message: "potansiyel müşteri ile görüştüm" })).toEqual({ category: "SALES", confidence: "HIGH" });
  });

  it("suppresses the category risk-guidance block for the demoted MEDIUM-confidence match", () => {
    const context = {
      analysis: { category: "PRICING", confidence: "MEDIUM", readiness: "READY" },
      guidance: { keyConsiderations: [], risks: ["Marj etkisi netleşmeden indirim önermek karlılığı zayıflatabilir."], missingInformation: [] },
      executiveGapSignal: null,
    } as unknown as ManagerAdviceAugmentationContext;

    expect(buildManagerAdviceAdvisoryPrompt(context)).toBeNull();
  });
});

// Regression: JS's `\b`/`\w` are ASCII-only, so a `\b` immediately touching a
// Turkish letter (ı, ş, ğ, ü, ö, ç) never matches — not even the letter's own
// correctly-spelled Turkish word. `/\bpahalı\b/u` never matched "pahalı"
// itself; `/\bödeme\s+alam/u` never matched "ödeme alamıyorum" typed with a
// real "ö". A user typing correct Turkish on a Turkish keyboard silently fell
// through to GENERAL/LOW confidence — the opposite failure mode from the
// generic-noun false positives above (missed real signal, not fabricated
// signal), but from the same root regex mechanism.
describe("manager advice classifier — Turkish word-boundary matching", () => {
  it("matches a correctly-typed Turkish word ending in a Turkish letter", () => {
    expect(classifyManagerAdvice({ message: "fiyatı pahalı buldu" })).toEqual({ category: "PRICING", confidence: "HIGH" });
    expect(classifyManagerAdvice({ message: "önceliğim bu değil" })).toEqual({ category: "STRATEGY", confidence: "HIGH" });
  });

  it("matches a correctly-typed Turkish word starting with a Turkish letter", () => {
    expect(classifyManagerAdvice({ message: "ödeme alamıyorum" })).toEqual({ category: "COLLECTION", confidence: "HIGH" });
  });

  it("still rejects a Turkish-lettered pattern as a substring of a longer, different word", () => {
    expect(classifyManagerAdvice({ message: "tahsilatçı bugün geldi" })).toEqual({ category: "GENERAL", confidence: "LOW" });
    expect(classifyManagerAdvice({ message: "vadesi yaklaşıyor" })).toEqual({ category: "GENERAL", confidence: "LOW" });
  });
});
