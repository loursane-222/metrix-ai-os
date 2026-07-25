import { afterEach, describe, expect, it, vi } from "vitest";
import { AiProviderConfigurationError } from "../ai-provider";
import { resolveConfiguredAiProvider } from "../provider-policy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("production AI provider policy", () => {
  it("fails closed when AI_PROVIDER is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_PROVIDER", "");
    expect(() => resolveConfiguredAiProvider()).toThrow(AiProviderConfigurationError);
  });

  it("fails closed for unsupported providers", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_PROVIDER", "unsupported");
    expect(() => resolveConfiguredAiProvider()).toThrow(AiProviderConfigurationError);
  });

  it("prohibits production mock even when explicitly requested", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_PROVIDER", "mock");
    expect(() => resolveConfiguredAiProvider()).toThrow(AiProviderConfigurationError);
  });

  it("allows an explicitly selected test mock", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AI_PROVIDER", "mock");
    expect(resolveConfiguredAiProvider()).toBe("mock");
  });

  it("selects the configured production OpenAI provider", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_PROVIDER", "openai");
    expect(resolveConfiguredAiProvider()).toBe("openai");
  });
});
