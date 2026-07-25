import type { AiProviderName } from "./ai-provider";
import { AiProviderConfigurationError } from "./ai-provider";

export function resolveConfiguredAiProvider(explicit?: AiProviderName): AiProviderName {
  const configured = explicit ?? process.env.AI_PROVIDER?.trim().toLowerCase();
  const environment = process.env.NODE_ENV;

  if (configured === "openai") return "openai";
  if (configured === "mock" && (environment === "test" || environment === "development")) {
    return "mock";
  }

  const eventType = configured === "mock"
    ? "PROHIBITED_MOCK_FALLBACK"
    : "INVALID_AI_PROVIDER_CONFIGURATION";
  console.error("[AIProviderPolicy]", {
    eventType,
    environment: environment ?? "unset",
    configuredProvider: configured || "unset",
  });
  throw new AiProviderConfigurationError(
    environment === "production"
      ? "AI_PROVIDER must be explicitly configured as openai in production."
      : "AI_PROVIDER must be explicitly configured as openai or mock.",
  );
}
