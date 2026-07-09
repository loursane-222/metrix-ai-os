import { buildBaseMetrixPrompt } from "./prompt-format";

import type { PromptTemplate } from "./prompt.types";

export const onboardingAssistantPromptTemplate: PromptTemplate = {
  id: "onboarding_assistant",
  version: "1.0.0",
  description: "Guides organization onboarding conversations.",
  render(input) {
    return [
      buildBaseMetrixPrompt(input),
      "",
      "Onboarding odagi:",
      "- Sirketi, ekip yapisini, surecleri ve hedefleri tanimaya calis.",
      "- Eksik bilgileri tek tek ve net sorularla tamamla.",
      "- Onboarding sirasinda kullaniciyi yormadan ilerle.",
    ].join("\n");
  },
};

export const generalConversationPromptTemplate: PromptTemplate = {
  id: "general_conversation",
  version: "1.0.0",
  description: "Handles general organization assistant conversations.",
  render(input) {
    return buildBaseMetrixPrompt(input);
  },
};

export const voiceConversationPromptTemplate: PromptTemplate = {
  id: "voice_conversation",
  version: "1.0.0",
  description: "Handles spoken (voice) conversations — same reasoning as general_conversation, different delivery.",
  render(input) {
    const openingReminder =
      typeof input.conversationPresence?.recentTurnCount === "number" &&
      input.conversationPresence.recentTurnCount > 0
        ? "- Bu toplantida daha once konustun. Bir onceki cevabinla ayni acilis kalibini tekrar etme."
        : null;

    return [
      buildBaseMetrixPrompt(input),
      "",
      "Sesli gorusme modu:",
      "- Bunu bir rapor gibi degil, devam eden bir yonetim toplantisinin konusma tarafi gibi ele al.",
      "- Markdown kullanma. Baslik, numarali/madde isaretli liste, ** veya # gibi bicimlendirme uretme.",
      "- 'Ozet:', 'Sonuc:', 'Degerlendirme:' gibi rapor basliklariyla baslama.",
      "- Ilk cumle tek bir fikir tasisin; birden fazla noktayi tek cumlede birlestirme.",
      "- Kisa cumleler kur. Bir cumle bir dusunce olsun.",
      "- Acilisini her seferinde ayni kalipla kurma; bazen dogrudan konuya gir, bazen kisa bir tepki ver, bazen ismi kullan, bazen hic kullanma. Bu bir sablon degil, o anki baglama gore degisen dogal bir tepki olmali.",
      ...(openingReminder ? [openingReminder] : []),
    ].join("\n");
  },
};

export const memoryExtractionPromptTemplate: PromptTemplate = {
  id: "memory_extraction",
  version: "1.0.0",
  description: "Extracts durable organization memories from conversation text.",
  render(input) {
    return [
      buildBaseMetrixPrompt(input),
      "",
      "Hafiza cikarma odagi:",
      "- Sadece kalici ve tekrar kullanilabilir bilgileri ayikla.",
      "- Emin olmadigin bilgiyi hafiza olarak onermeden once belirsizligini belirt.",
      "- Kisi, surec, tercih, iliski ve fakt ayrimini koru.",
    ].join("\n");
  },
};

export const promptTemplates = [
  onboardingAssistantPromptTemplate,
  generalConversationPromptTemplate,
  voiceConversationPromptTemplate,
  memoryExtractionPromptTemplate,
] as const;
