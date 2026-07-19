import { createOpenAiProvider } from "@/lib/ai/providers/openai-provider";
import { mockProvider } from "@/lib/ai/providers/mock-provider";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { GenerateCustomerCreatePlanText } from "./customer-create-conversation-planner";
const context: MemoryContext = { version: "v1", generatedAt: new Date(0).toISOString(), organizationId: "", totalIncluded: 0, facts: [], processes: [], strategic: [], preferences: [], highlights: [], conflicts: [] };
const openai = createOpenAiProvider({ maxOutputTokens: 350, temperature: 0.1 });
export const generateCustomerCreatePlanText: GenerateCustomerCreatePlanText = async ({ systemPrompt, userMessage }) => {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() === "openai" ? openai : mockProvider;
  return (await provider.generateResponse({ systemPrompt, userMessage, context })).content;
};
