import OpenAI from "openai";
import type {
  ResponseOutputItem,
  ResponseUsage,
} from "openai/resources/responses/responses";

import type {
  AiProvider,
  AiProviderName,
  AiProviderUsage,
  GenerateResponseInput,
  GenerateResponseResult,
} from "./ai-provider";
import {
  AiProviderConfigurationError,
  AiProviderRequestError,
} from "./ai-provider";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_MAX_OUTPUT_TOKENS = 520;
const DEFAULT_TEMPERATURE = 0.4;

const RESEARCH_DEFAULT_MAX_OUTPUT_TOKENS = 1500;
const RESEARCH_DEFAULT_TEMPERATURE = 0.15;
const RESEARCH_DEFAULT_SEARCH_CONTEXT_SIZE = "medium" as const;

type OpenAiProviderOptions = {
  apiKey?: string;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
};

export function createOpenAiProvider(
  options: OpenAiProviderOptions = {},
): AiProvider {
  const model = options.model ?? DEFAULT_OPENAI_MODEL;
  const maxOutputTokens =
    options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;

  return {
    name: "openai",

    async generateResponse(
      input: GenerateResponseInput,
    ): Promise<GenerateResponseResult> {
      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

      if (!apiKey) {
        throw new AiProviderConfigurationError(
          "OPENAI_API_KEY is not configured.",
        );
      }

      const client = new OpenAI({ apiKey });

      try {
        const tOpenAI = performance.now();
        const response = await client.responses.create({
          model,
          instructions: input.systemPrompt,
          input: input.userMessage,
          max_output_tokens: maxOutputTokens,
          metadata: input.metadata,
          store: false,
          temperature,
        });
        logOpenAiTelemetry("openai-provider", response, Math.round(performance.now() - tOpenAI));

        return {
          content: extractOpenAiContent(response.output_text),
          model,
          provider: "openai",
          usage: normalizeOpenAiUsage(response.usage),
          rawResponseId: response.id,
        };
      } catch (error: unknown) {
        throw new AiProviderRequestError(
          buildOpenAiRequestErrorMessage(error),
        );
      }
    },
  };
}

export const openAiProvider = createOpenAiProvider();

function extractOpenAiContent(outputText: string): string {
  const content = outputText.trim();

  if (!content) {
    throw new AiProviderRequestError(
      "OpenAI provider returned an empty response.",
    );
  }

  return content;
}

function normalizeOpenAiUsage(
  usage: ResponseUsage | null | undefined,
): AiProviderUsage | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
}

function buildOpenAiRequestErrorMessage(error: unknown): string {
  const status = getErrorStatus(error);

  if (status) {
    return `OpenAI provider request failed with status ${status}.`;
  }

  return "OpenAI provider request failed.";
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;

  return typeof status === "number" ? status : undefined;
}

// ─── Streaming ───────────────────────────────────────────────────────────────

export type OpenAiStreamHandle = {
  textStream: AsyncGenerator<string, void, unknown>;
  getFinalMeta: () => Promise<{
    model: string;
    provider: AiProviderName;
    usage: AiProviderUsage | undefined;
    rawResponseId: string;
    content: string;
  }>;
};

export function createOpenAiStream(input: GenerateResponseInput): OpenAiStreamHandle {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiProviderConfigurationError("OPENAI_API_KEY is not configured.");

  const client = new OpenAI({ apiKey });
  const responseStream = client.responses.stream({
    model: DEFAULT_OPENAI_MODEL,
    instructions: input.systemPrompt,
    input: input.userMessage,
    max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
    metadata: input.metadata as Record<string, string> | undefined,
    store: false,
    temperature: DEFAULT_TEMPERATURE,
  });

  const chunks: string[] = [];

  async function* textStream(): AsyncGenerator<string, void, unknown> {
    for await (const event of responseStream) {
      if (event.type === "response.output_text.delta") {
        chunks.push(event.delta);
        yield event.delta;
      }
    }
  }

  return {
    textStream: textStream(),
    getFinalMeta: async () => {
      const response = await responseStream.finalResponse();
      return {
        model: DEFAULT_OPENAI_MODEL,
        provider: "openai" as const,
        usage: normalizeOpenAiUsage(response.usage),
        rawResponseId: response.id,
        content: chunks.join("") || response.output_text?.trim() || "",
      };
    },
  };
}

// ─── Research Provider ───────────────────────────────────────────────────────

export type ResearchProviderUserLocation = {
  country?: string;
  city?: string;
  region?: string;
  timezone?: string;
};

export type ResearchProviderOptions = {
  apiKey?: string;
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
  allowedDomains?: string[];
  searchContextSize?: "low" | "medium" | "high";
  userLocation?: ResearchProviderUserLocation;
};

export type ResearchUrlCitation = {
  url: string;
  title: string;
};

export type ResearchGenerateInput = {
  systemPrompt: string;
  researchQuery: string;
};

export type ResearchGenerateResult = {
  content: string;
  model: string;
  usage?: AiProviderUsage;
  rawResponseId?: string;
  urlCitations: ResearchUrlCitation[];
  citationCount: number;
  searchQueries: string[];
};

export type ResearchProvider = {
  generateResearch(input: ResearchGenerateInput): Promise<ResearchGenerateResult>;
};

export function createOpenAiResearchProvider(
  options: ResearchProviderOptions = {},
): ResearchProvider {
  const model = options.model ?? DEFAULT_OPENAI_MODEL;
  const maxOutputTokens = options.maxOutputTokens ?? RESEARCH_DEFAULT_MAX_OUTPUT_TOKENS;
  const temperature = options.temperature ?? RESEARCH_DEFAULT_TEMPERATURE;
  const searchContextSize = options.searchContextSize ?? RESEARCH_DEFAULT_SEARCH_CONTEXT_SIZE;

  return {
    async generateResearch(input: ResearchGenerateInput): Promise<ResearchGenerateResult> {
      const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;

      if (!apiKey) {
        throw new AiProviderConfigurationError("OPENAI_API_KEY is not configured.");
      }

      const client = new OpenAI({ apiKey });

      const webSearchTool = {
        type: "web_search_2025_08_26" as const,
        search_context_size: searchContextSize,
        filters: options.allowedDomains?.length
          ? { allowed_domains: options.allowedDomains }
          : undefined,
        user_location: options.userLocation
          ? {
              type: "approximate" as const,
              country: options.userLocation.country ?? undefined,
              city: options.userLocation.city ?? undefined,
              region: options.userLocation.region ?? undefined,
              timezone: options.userLocation.timezone ?? undefined,
            }
          : undefined,
      };

      try {
        const tOpenAI = performance.now();
        const response = await client.responses.create({
          model,
          instructions: input.systemPrompt,
          input: input.researchQuery,
          max_output_tokens: maxOutputTokens,
          temperature,
          store: false,
          tools: [webSearchTool],
        });
        logOpenAiTelemetry("openai-research-provider", response, Math.round(performance.now() - tOpenAI));

        const urlCitations = extractUrlCitations(response.output);
        const searchQueries = extractSearchQueries(response.output);

        return {
          content: extractResearchContent(response.output_text),
          model,
          usage: normalizeOpenAiUsage(response.usage),
          rawResponseId: response.id,
          urlCitations,
          citationCount: urlCitations.length,
          searchQueries,
        };
      } catch (error: unknown) {
        throw new AiProviderRequestError(buildOpenAiRequestErrorMessage(error));
      }
    },
  };
}

function extractResearchContent(outputText: string): string {
  const content = outputText.trim();

  if (!content) {
    throw new AiProviderRequestError(
      "OpenAI research provider returned an empty response.",
    );
  }

  return content;
}

function extractUrlCitations(output: ResponseOutputItem[]): ResearchUrlCitation[] {
  const citations: ResearchUrlCitation[] = [];
  const seenUrls = new Set<string>();

  for (const item of output) {
    if (item.type !== "message") continue;
    for (const contentPart of item.content) {
      if (contentPart.type !== "output_text") continue;
      for (const annotation of contentPart.annotations) {
        if (annotation.type !== "url_citation") continue;
        if (seenUrls.has(annotation.url)) continue;
        seenUrls.add(annotation.url);
        citations.push({ url: annotation.url, title: annotation.title });
      }
    }
  }

  return citations;
}

function extractSearchQueries(output: ResponseOutputItem[]): string[] {
  const queries: string[] = [];

  for (const item of output) {
    if (item.type !== "web_search_call") continue;
    const action = item.action;
    if (action.type !== "search") continue;
    if (action.queries?.length) {
      queries.push(...action.queries);
    } else if (action.query) {
      queries.push(action.query);
    }
  }

  return queries;
}
