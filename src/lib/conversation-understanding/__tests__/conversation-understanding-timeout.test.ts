import { describe, expect, it, vi } from "vitest";

const constructorArgs = vi.hoisted(() => ({ captured: null as Record<string, unknown> | null }));

vi.mock("openai", () => ({
  default: class OpenAI {
    constructor(options: Record<string, unknown>) {
      constructorArgs.captured = options;
    }
    responses = {
      create: vi.fn().mockResolvedValue({ output_text: "{}" }),
    };
  },
}));
vi.mock("@/lib/ai/telemetry/openai-telemetry", () => ({ logOpenAiTelemetry: vi.fn() }));

import { classifyConversation } from "../conversation-understanding.service";

describe("classifyConversation timeout", () => {
  it("uses a short-enough timeout that a stuck call still reaches SAFE_FALLBACK quickly", async () => {
    const originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    await classifyConversation({ message: "merhaba" });

    // Classification gates the whole turn (fast-path miss forces every
    // business-keyword message through this one call) — it must not share
    // the 45s budget the primary generation call uses elsewhere, or a slow
    // provider leaves the user waiting up to ~90s (with the retry) before
    // SAFE_FALLBACK ever kicks in.
    expect(constructorArgs.captured?.timeout).toBeLessThanOrEqual(15_000);

    process.env.OPENAI_API_KEY = originalApiKey;
  });
});
