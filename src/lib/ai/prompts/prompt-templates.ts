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
  memoryExtractionPromptTemplate,
] as const;
