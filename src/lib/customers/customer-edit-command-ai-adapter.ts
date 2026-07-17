// Server-only production wiring for the Customer Edit command resolver.
// Deliberately calls the OpenAI provider directly (a fresh, low-temperature
// instance tuned for short strict-JSON output) instead of going through
// streamWithAiGateway/generateWithAiGateway — that gateway builds the full
// Executive Brain operating context (memory, quote/payment intelligence,
// conversation state, ...) this narrow classification task never reads.
// Only ever imported by the edit-command API route — never by client code
// (it reads process.env.OPENAI_API_KEY, which must not enter the browser
// bundle).

import { createOpenAiProvider } from "@/lib/ai/providers/openai-provider";
import { mockProvider } from "@/lib/ai/providers/mock-provider";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { GenerateCustomerEditCommandText } from "./customer-edit-command-resolver";

const RESOLVER_MAX_OUTPUT_TOKENS = 200;
const RESOLVER_TEMPERATURE = 0.1;

// AiProvider.generateResponse() requires a MemoryContext parameter, but
// neither provider implementation this resolver can reach (openai, mock)
// reads it for anything relevant to short-JSON command classification — the
// OpenAI provider never forwards `context` to the API call at all, and mock
// only reads it to build conversational filler text, which this resolver
// discards as invalid_output. An empty context is therefore inert plumbing
// to satisfy the provider's shared type, not a real memory read.
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

function resolveConfiguredProviderName(): "openai" | "mock" {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();
  return configured === "openai" ? "openai" : "mock";
}

export const generateCustomerEditCommandText: GenerateCustomerEditCommandText = async ({
  systemPrompt,
  userMessage,
}) => {
  const provider = resolveConfiguredProviderName() === "openai" ? resolverOpenAiProvider : mockProvider;
  const result = await provider.generateResponse({
    systemPrompt,
    userMessage,
    context: EMPTY_MEMORY_CONTEXT,
  });
  return result.content;
};
