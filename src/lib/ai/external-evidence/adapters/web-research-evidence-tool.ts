import {
  AiProviderConfigurationError,
  AiProviderRequestError,
} from "@/lib/ai/providers/ai-provider";
import {
  createOpenAiResearchProvider,
  type ResearchProvider,
  type ResearchProviderOptions,
} from "@/lib/ai/providers/openai-provider";
import type {
  ExternalEvidenceFailureReason,
  ExternalEvidenceResult,
  ExternalEvidenceTool,
} from "../external-evidence.types";

// Proves the evidence contract with the smallest possible real adapter:
// this wraps the existing OpenAI web-search research provider (already
// live in production via research-director.service.ts's daily briefing
// research — no new provider, no new dependency, no new API key) instead
// of introducing a new external integration. It never returns provider
// prose as the payload's only content without also carrying its
// provenance, and it never lets a provider exception escape this
// boundary — see external-evidence.types.ts's ExternalEvidenceTool
// contract for why that matters.
export type WebResearchEvidencePayload = Readonly<{
  summary: string;
  searchQueries: readonly string[];
  citationCount: number;
}>;

export function createWebResearchEvidenceTool(input: {
  systemPrompt: string;
  options?: ResearchProviderOptions;
  // Injectable for tests; defaults to the real OpenAI-backed provider.
  provider?: ResearchProvider;
}): ExternalEvidenceTool {
  const provider = input.provider ?? createOpenAiResearchProvider(input.options);

  return {
    capability: "web_research",
    async fetch(query: string): Promise<ExternalEvidenceResult> {
      const retrievedAt = new Date().toISOString();
      try {
        const result = await provider.generateResearch({
          systemPrompt: input.systemPrompt,
          researchQuery: query,
        });
        const payload: WebResearchEvidencePayload = {
          summary: result.content,
          searchQueries: result.searchQueries,
          citationCount: result.citationCount,
        };
        return {
          status: "SUCCESS",
          capability: "web_research",
          query,
          retrievedAt,
          provenance: result.urlCitations.map((citation) => ({
            providerId: "openai_web_search",
            sourceName: citation.title || null,
            sourceUrl: citation.url || null,
          })),
          payload,
        };
      } catch (error: unknown) {
        console.error("[ExternalEvidence][web_research] fetch failed", {
          errorName: error instanceof Error ? error.name : typeof error,
        });
        return {
          status: "FAILED",
          capability: "web_research",
          query,
          retrievedAt,
          failureReason: classifyFailure(error),
        };
      }
    },
  };
}

function classifyFailure(error: unknown): ExternalEvidenceFailureReason {
  if (error instanceof AiProviderConfigurationError) return "not_configured";
  if (error instanceof AiProviderRequestError) return "provider_error";
  return "provider_error";
}
