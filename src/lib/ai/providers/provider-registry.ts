import type { AiProvider, AiProviderName } from "./ai-provider";
import { mockProvider } from "./mock-provider";
import { openAiProvider } from "./openai-provider";

const providers: Record<AiProviderName, AiProvider> = {
  mock: mockProvider,
  openai: openAiProvider,
};

export function getAiProvider(providerName: AiProviderName): AiProvider {
  return providers[providerName];
}

