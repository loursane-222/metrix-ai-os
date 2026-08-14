import { createOpenAiProvider } from "@/lib/ai/providers/openai-provider";
import { mockProvider } from "@/lib/ai/providers/mock-provider";
import { resolveConfiguredAiProvider } from "@/lib/ai/providers/provider-policy";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { GenerateInvoiceEditCommandText } from "./invoice-edit-command-resolver";
const EMPTY_MEMORY_CONTEXT: MemoryContext = { version: "v1", generatedAt: new Date(0).toISOString(), organizationId: "", totalIncluded: 0, facts: [], processes: [], strategic: [], preferences: [], highlights: [], conflicts: [] };
const provider = createOpenAiProvider({ maxOutputTokens: 120, temperature: 0.1 });
export const generateInvoiceEditCommandText: GenerateInvoiceEditCommandText = async ({ systemPrompt, userMessage }) => (await (resolveConfiguredAiProvider() === "openai" ? provider : mockProvider).generateResponse({ systemPrompt, userMessage, context: EMPTY_MEMORY_CONTEXT })).content;
