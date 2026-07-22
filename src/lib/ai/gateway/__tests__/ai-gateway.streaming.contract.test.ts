import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/lib/ai/gateway/ai-gateway.ts"), "utf8");

describe("AI gateway streaming profiles", () => {
  it("keeps immediate fast-path generation out of heavy context and Gmail retrieval", () => {
    const start = source.indexOf('if (input.contextProfile === "immediate_minimal")');
    const end = source.indexOf('logGatewayLatency(latencyId, latencyStartAt, "operating_context_start");', start);
    const minimal = source.slice(start, end);
    expect(minimal).not.toContain("buildExecutiveOperatingContext({");
    expect(minimal).not.toContain("retrieveGmailContext({");
    expect(minimal).toContain("input.organizationSummary,");
    expect(minimal).toContain("input.currentUserName ? `Current user:");
    expect(minimal).toContain("conversationPresence: input.conversationPresence ?? null");
    expect(minimal).toContain("createOpenAiStream(");
  });

  it("emits correlated gateway and provider telemetry", () => {
    expect(source).toContain("const latencyId = input.requestId ??");
    for (const label of [
      "stream_gateway_enter", "operating_context_start", "operating_context_done",
      "prompt_bridge_start", "prompt_bridge_done", "gmail_context_start", "gmail_context_done",
      "prompt_render_start", "prompt_render_done", "openai_stream_create_start",
      "openai_stream_create_done", "stream_gateway_return", "provider_first_delta",
      "provider_stream_complete",
    ]) expect(source).toContain(`"${label}"`);
  });
});
