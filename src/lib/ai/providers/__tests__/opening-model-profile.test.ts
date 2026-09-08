import { afterEach, describe, expect, it, vi } from "vitest";
const { stream } = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { stream }; } }));
import { createOpenAiStream } from "../openai-provider";
import type { GenerateResponseInput } from "../ai-provider";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("opening-only model profile", () => {
  it.each([false, true])("preserves defaults and reports the actual selected model (opening=%s)", async (opening) => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    stream.mockReturnValue({ finalResponse: async () => ({ id: "test", output_text: "" }) });
    const handle = createOpenAiStream({ systemPrompt: "test", userMessage: "test" } as GenerateResponseInput,
      opening ? { model: "gpt-5.6-luna", reasoning: { effort: "none" }, maxOutputTokens: 96, temperature: 0.3 } : {});
    const request = stream.mock.calls[0][0];
    expect(request.model).toBe(opening ? "gpt-5.6-luna" : "gpt-4.1-mini");
    expect(request.reasoning).toEqual(opening ? { effort: "none" } : undefined);
    expect(request.max_output_tokens).toBe(opening ? 96 : 520);
    expect((await handle.getFinalMeta()).model).toBe(request.model);
  });
});
