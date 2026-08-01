// Server-only production wiring for the Offer Edit command resolver — mirrors
// customer-edit-command-ai-adapter.ts exactly. Only ever imported by the
// edit-command API route — never by client code (reads process.env.OPENAI_API_KEY).

import { createOpenAiProvider } from "@/lib/ai/providers/openai-provider";
import { mockProvider } from "@/lib/ai/providers/mock-provider";
import { resolveConfiguredAiProvider } from "@/lib/ai/providers/provider-policy";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { GenerateOfferEditCommandText } from "./offer-edit-command-resolver";

const RESOLVER_MAX_OUTPUT_TOKENS = 200;
const RESOLVER_TEMPERATURE = 0.1;

const EMPTY_MEMORY_CONTEXT: MemoryContext = {
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

const resolverOpenAiProvider = createOpenAiProvider({
  maxOutputTokens: RESOLVER_MAX_OUTPUT_TOKENS,
  temperature: RESOLVER_TEMPERATURE,
});

export const generateOfferEditCommandText: GenerateOfferEditCommandText = async ({ systemPrompt, userMessage }) => {
  const provider = resolveConfiguredAiProvider() === "openai" ? resolverOpenAiProvider : mockProvider;
  const result = await provider.generateResponse({
    systemPrompt,
    userMessage,
    context: EMPTY_MEMORY_CONTEXT,
  });
  return result.content;
};
