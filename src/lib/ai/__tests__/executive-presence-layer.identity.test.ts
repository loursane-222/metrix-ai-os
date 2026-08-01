import { describe, expect, it } from "vitest";

import { sanitizeExecutiveManagerResponse } from "../executive-presence-layer";

describe("sanitizeExecutiveManagerResponse identity boundary", () => {
  it.each([
    ["Ben ChatGPT'yim.", "self_identified_as_general_ai"],
    ["Kalıcı hafızam yok ve şirketini tanımıyorum.", "absolute_context_denial"],
    ["Hiçbir sistemde işlem yapamam.", "absolute_capability_denial"],
    ["Her sistemde sınırsızca işlem yapabilirim.", "unbounded_capability_claim"],
  ])("routes %s into the existing repair contract", (content, reason) => {
    expect(
      sanitizeExecutiveManagerResponse({ content, userMessage: "Sen kimsin?" }),
    ).toEqual({ content, needsRepair: true, reason });
  });

  it("preserves third-person explanations", () => {
    expect(
      sanitizeExecutiveManagerResponse({
        content: "ChatGPT genel amaçlı bir modeldir.",
        userMessage: "ChatGPT nedir?",
      }),
    ).toEqual({
      content: "ChatGPT genel amaçlı bir modeldir.",
      needsRepair: false,
    });
  });

  it("keeps a normal production response on the no-repair path", () => {
    const content = "Tahsilat sistemindeki mevcut context bu kararı destekliyor; önce vade kaydını doğrulayalım.";
    expect(
      sanitizeExecutiveManagerResponse({
        content,
        userMessage: "Bu müşteriye yeniden vade verelim mi?",
      }),
    ).toEqual({ content, needsRepair: false });
  });

  it("routes a generic assistant register to repair", () => {
    expect(
      sanitizeExecutiveManagerResponse({
        content: "Size nasıl yardımcı olabilirim?",
        userMessage: "Merhaba",
      }),
    ).toEqual({
      content: "Size nasıl yardımcı olabilirim?",
      needsRepair: true,
      reason: "generic_assistant_register",
    });
  });

  it.each(["Bu müşteri verisine erişimim yok.", "Bu işlemi yapamam.", "Müşteri sistemine bağlantım yok.", "Gerekli müşteri bilgileri ve yetkiler sistemde mevcut değil.", "Gerekli alanlar ve yetkiler açısından yeterli kayıt bulunmuyor.", "Atlas müşterisi için kayıt oluşturma yetkim ve bağlantım şu an mevcut değil. Müşteri oluşturma işlemini destekleyen belge yükleme akışıyla devam edebiliriz.", "Atlas müşterisi için mevcut yetki ve bağlantı durumuna göre kayıt oluşturma işlemini başlatamam. Müşteri oluşturma için gerekli alanlar ve onaylar eksik. Başka nasıl destek olabilirim?", "Atlas müşterisi için kayıt oluşturma yetkim ve bağlantım bulunmuyor. Ancak, müşteri bilgilerini içeren belgeleri PNG, JPEG, WebP veya PDF formatında yükleyebilirsen, alan çıkarma ve müşteri oluşturma akışını başlatabiliriz. İlgili dosyayı paylaşır mısın?"])("rejects a capability denial without canonical denial evidence: %s", (content) => {
    expect(sanitizeExecutiveManagerResponse({ content, userMessage: "Atlas müşterisini aç." })).toEqual({ content, needsRepair: true, reason: "absolute_capability_denial" });
  });

  it("allows a bounded denial only when canonical denial evidence exists", () => {
    const content = "Bu sisteme erişimim yok.";
    expect(sanitizeExecutiveManagerResponse({ content, userMessage: "Bu entegrasyon bağlı mı?", capabilityDenialAllowed: true })).toEqual({ content, needsRepair: false });
  });

  it("rejects a data denial after canonical customer resolution", () => {
    const content = "Müşteri kayıtları sistemde görünmüyor.";
    expect(sanitizeExecutiveManagerResponse({ content, userMessage: "Atlas müşterisini aç.", canonicalCustomerResolved: true })).toEqual({ content, needsRepair: true, reason: "absolute_context_denial" });
  });
});
