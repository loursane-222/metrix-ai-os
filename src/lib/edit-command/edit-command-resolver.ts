import type { DomainFieldRegistry } from "./domain-field-registry";

export type GenerateEditCommandText = (input: { systemPrompt: string; userMessage: string }) => Promise<string>;
export type EditCommandResolveOutcome<TResolution> = { kind: "resolved"; resolution: TResolution } | { kind: "invalid_output" };

export async function resolveEditCommand<TResolution>(params: {
  domain: string;
  fieldRegistry: DomainFieldRegistry;
  utterance: string;
  activeTab: string;
  generateText: GenerateEditCommandText;
  buildSystemPrompt: (input: { domain: string; activeTab: string; fieldRegistry: DomainFieldRegistry }) => string;
  validateResolution: (raw: unknown) => TResolution | null;
}): Promise<EditCommandResolveOutcome<TResolution>> {
  if (params.fieldRegistry.domain !== params.domain) {
    throw new Error(`Edit command registry domain mismatch: expected ${params.domain}, received ${params.fieldRegistry.domain}.`);
  }
  const systemPrompt = params.buildSystemPrompt({ domain: params.domain, activeTab: params.activeTab, fieldRegistry: params.fieldRegistry });
  const raw = await params.generateText({ systemPrompt, userMessage: params.utterance });
  const parsed = tryParseJson(raw);
  if (parsed === undefined) return { kind: "invalid_output" };
  const resolution = params.validateResolution(parsed);
  return resolution ? { kind: "resolved", resolution } : { kind: "invalid_output" };
}

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  try { return JSON.parse(fenced ? fenced[1]!.trim() : trimmed); } catch { return undefined; }
}
