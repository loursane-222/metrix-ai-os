import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/lib/ai/gateway/ai-gateway.ts"), "utf8");

describe("AI gateway streaming profiles", () => {
  it("keeps conversational and light generation out of full operating context", () => {
    const start = source.indexOf('contextProfile === "conversational_minimal"');
    const end = source.indexOf('logGatewayLatency(latencyId, latencyStartAt, "operating_context_start");', start);
    const minimal = source.slice(start, end);
    expect(minimal).not.toContain("buildExecutiveOperatingContext({");
    expect(minimal).toContain('contextProfile === "business_light"');
    expect(minimal).toContain("input.preloadedMemoryContext");
    expect(minimal).toContain("executiveManagementPicture: input.executiveManagementPicture");
    expect(minimal).toContain("executiveAssessment: input.executiveAssessment");
    expect(minimal).toContain("executiveDirective: input.executiveDirective");
    // business_light (data_lookup/customer_context queries) gets canonical
    // repository evidence via organizationSummary; the other two minimal
    // profiles stay stripped down for latency — see the conditional above.
    expect(minimal).toContain('contextProfile === "business_light" ? input.organizationSummary : undefined');
    expect(minimal).not.toContain("input.currentUserName");
    expect(minimal).toContain("createOpenAiStream(");
  });

  it("reuses request memory without a second operating-context authority", () => {
    expect(source).toContain("input.preloadedMemoryContext ??");
    expect(source).not.toContain("buildExecutiveOperatingContext");
  });

  it("emits correlated gateway and provider telemetry", () => {
    expect(source).toContain("const latencyId = input.requestId ??");
    for (const label of [
      "stream_gateway_enter", "operating_context_start", "operating_context_done",
      "prompt_render_start", "prompt_render_done", "openai_stream_create_start",
      "openai_stream_create_done", "stream_gateway_return", "provider_first_delta",
      "provider_stream_complete",
    ]) expect(source).toContain(`"${label}"`);
    expect(source).not.toContain('"prompt_bridge_start"');
    expect(source).not.toContain('"gmail_context_start"');
  });

  it("completes canonical guidance and prompt projection before skipping deterministic provider generation", () => {
    const guidance = source.indexOf("input.onExecutiveConversationGuidanceObserved?.(executiveConversationGuidance)");
    const prompt = source.indexOf("const renderedPrompt = renderPromptTemplate({", guidance);
    const skip = source.indexOf("if (input.skipProviderGeneration)", prompt);
    const provider = source.indexOf("createOpenAiStream(", skip);
    expect(guidance).toBeGreaterThan(0);
    expect(prompt).toBeGreaterThan(guidance);
    expect(skip).toBeGreaterThan(prompt);
    expect(provider).toBeGreaterThan(skip);
    expect(source).toContain('"provider_generation_skipped"');
  });
});
