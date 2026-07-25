import { createOpenAiProvider } from "@/lib/ai/providers/openai-provider";
import { mockProvider } from "@/lib/ai/providers/mock-provider";
import { resolveConfiguredAiProvider } from "@/lib/ai/providers/provider-policy";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { GenerateCustomFieldPlanText } from "./customer-custom-field-conversation-planner";
const context: MemoryContext = { version: "v1", generatedAt: new Date(0).toISOString(), organizationId: "", totalIncluded: 0, facts: [], processes: [], strategic: [], preferences: [], highlights: [], conflicts: [] };
const openai = createOpenAiProvider({ maxOutputTokens: 350, temperature: 0.1 });
export const generateCustomFieldPlanText: GenerateCustomFieldPlanText = async ({ systemPrompt, userMessage }) => { const provider = resolveConfiguredAiProvider() === "openai" ? openai : mockProvider; return (await provider.generateResponse({ systemPrompt, userMessage, context })).content; };
