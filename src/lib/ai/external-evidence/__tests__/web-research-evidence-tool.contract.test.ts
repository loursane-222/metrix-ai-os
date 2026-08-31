import { describe, expect, it } from "vitest";
import {
  AiProviderConfigurationError,
  AiProviderRequestError,
} from "@/lib/ai/providers/ai-provider";
import type {
  ResearchGenerateInput,
  ResearchGenerateResult,
  ResearchProvider,
} from "@/lib/ai/providers/openai-provider";
import { createWebResearchEvidenceTool } from "../adapters/web-research-evidence-tool";

function fakeProvider(
  handler: (input: ResearchGenerateInput) => Promise<ResearchGenerateResult>,
): ResearchProvider {
  return { generateResearch: handler };
}

describe("createWebResearchEvidenceTool — reuses the existing research provider, never speaks directly", () => {
  it("maps a successful provider result into the canonical evidence shape, preserving citation provenance", async () => {
    const provider = fakeProvider(async () => ({
      content: "ABC şirketi 2024'te kuruldu.",
      model: "gpt-4.1-mini",
      urlCitations: [{ url: "https://abc.example.com", title: "ABC Hakkında" }],
      citationCount: 1,
      searchQueries: ["ABC şirketi"],
    }));
    const tool = createWebResearchEvidenceTool({ systemPrompt: "test", provider });

    const result = await tool.fetch("ABC şirketini araştır");

    expect(result.status).toBe("SUCCESS");
    if (result.status !== "SUCCESS") throw new Error("expected SUCCESS");
    expect(result.capability).toBe("web_research");
    expect(result.provenance).toEqual([
      { providerId: "openai_web_search", sourceName: "ABC Hakkında", sourceUrl: "https://abc.example.com" },
    ]);
    expect(result.payload).toEqual({
      summary: "ABC şirketi 2024'te kuruldu.",
      searchQueries: ["ABC şirketi"],
      citationCount: 1,
    });
  });

  it("normalizes a provider configuration error to a structured not_configured failure, never a raw message", async () => {
    const provider = fakeProvider(async () => {
      throw new AiProviderConfigurationError("OPENAI_API_KEY is not configured.");
    });
    const tool = createWebResearchEvidenceTool({ systemPrompt: "test", provider });

    const result = await tool.fetch("query");

    expect(result).toMatchObject({ status: "FAILED", failureReason: "not_configured" });
    expect(JSON.stringify(result)).not.toContain("OPENAI_API_KEY");
  });

  it("normalizes a provider request error to a structured provider_error failure, never a raw message", async () => {
    const provider = fakeProvider(async () => {
      throw new AiProviderRequestError("upstream 429: rate limited by vendor X");
    });
    const tool = createWebResearchEvidenceTool({ systemPrompt: "test", provider });

    const result = await tool.fetch("query");

    expect(result).toMatchObject({ status: "FAILED", failureReason: "provider_error" });
    expect(JSON.stringify(result)).not.toContain("rate limited by vendor X");
  });
});
