import OpenAI from "openai";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";
import { listFieldVisits } from "@/lib/core/field-visits/field-visit.service";
import { REP_MORNING_BRIEFING_SUGGESTION_PROMPT } from "./rep-morning-briefing.prompt";
import { resolveRepGoalAchievement, type RepGoalStatus } from "./rep-goal-achievement.service";

const NOTE_SUGGESTION_MODEL = "gpt-4.1-mini";
const RECENT_NOTES_WINDOW_DAYS = 7;
const MAX_NOTES_CONSIDERED = 15;

export type RepMorningBriefing = Readonly<{
  goalStatus: RepGoalStatus;
  noteSuggestion: string | null;
}>;

/**
 * Returns null when the rep has no active personal goal at all — nothing
 * honest to brief them on (mirrors resolveRepGoalAchievement's own
 * convention). noteSuggestion is independently null whenever there are no
 * recent notes to draw from, or no OpenAI key configured — never
 * fabricated.
 */
export async function buildRepMorningBriefing(
  organizationId: string,
  repUserId: string,
  reference: Date = new Date(),
): Promise<RepMorningBriefing | null> {
  const goalStatus = await resolveRepGoalAchievement(organizationId, repUserId, reference);
  if (!goalStatus) return null;

  const noteSuggestion = await buildNoteSuggestion(organizationId, repUserId, reference);
  return { goalStatus, noteSuggestion };
}

async function buildNoteSuggestion(organizationId: string, repUserId: string, reference: Date): Promise<string | null> {
  const startAt = new Date(reference.getTime() - RECENT_NOTES_WINDOW_DAYS * 86_400_000);
  const visits = await listFieldVisits({ organizationId, repUserId, startAt, endAt: reference });
  const notedVisits = visits.filter((visit) => visit.notes && visit.notes.trim().length > 0).slice(0, MAX_NOTES_CONSIDERED);
  if (notedVisits.length === 0) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 1 });
  const notesText = notedVisits.map((visit) => `- ${visit.customerNameRaw}: ${visit.notes}`).join("\n");

  const tOpenAI = performance.now();
  const response = await client.responses.create({
    model: NOTE_SUGGESTION_MODEL,
    instructions: REP_MORNING_BRIEFING_SUGGESTION_PROMPT,
    input: notesText,
    max_output_tokens: 250,
    temperature: 0.3,
    store: false,
  });
  logOpenAiTelemetry("rep-morning-briefing-suggestion", response, Math.round(performance.now() - tOpenAI));

  const text = response.output_text?.trim();
  return text && text.length > 0 ? text : null;
}
