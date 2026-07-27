import { createOpenAiProvider } from "@/lib/ai/providers/openai-provider";
import { mockProvider } from "@/lib/ai/providers/mock-provider";
import { resolveConfiguredAiProvider } from "@/lib/ai/providers/provider-policy";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { GenerateBusinessRealityExtraction } from "./business-reality-extraction.service";

const emptyContext: MemoryContext = {
  version: "v1",
  generatedAt: new Date(0).toISOString(),
  organizationId: "",
  totalIncluded: 0,
  facts: [],
  processes: [],
  strategic: [],
  preferences: [],
  highlights: [],
  conflicts: [],
};

const extractionProvider = createOpenAiProvider({
  maxOutputTokens: 900,
  temperature: 0,
});

export const generateBusinessRealityExtractionText: GenerateBusinessRealityExtraction =
  async ({ systemPrompt, userMessage }) => {
    const provider = resolveConfiguredAiProvider() === "openai"
      ? extractionProvider
      : mockProvider;
    return (await provider.generateResponse({
      systemPrompt,
      userMessage,
      context: emptyContext,
    })).content;
  };
