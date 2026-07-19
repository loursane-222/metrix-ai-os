import OpenAI from "openai";

import { fail } from "@/lib/api/response";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { resolveVoiceAuthorityFromEnv } from "@/lib/voice/voice-preference-authority";

export async function POST(request: Request): Promise<Response> {
  try {
    await requireAuthContextFromCookies();
  } catch (error: unknown) {
    return authFail(error);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fail("TTS is not configured.", 503);
  }

  let text: string;
  let styleHint: TtsStyleHint = "neutral";
  try {
    const body = (await request.json()) as unknown;
    text =
      isRecord(body) && typeof body.text === "string" ? body.text.trim() : "";
    if (isRecord(body) && isTtsStyleHint(body.styleHint)) {
      styleHint = body.styleHint;
    }
  } catch {
    return fail("Invalid request body.", 400);
  }

  if (!text) {
    return fail("text is required.", 400);
  }

  try {
    const voiceProfile = resolveVoiceAuthorityFromEnv("chat").profile;
    const client = new OpenAI({ apiKey });
    const response = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voiceProfile.ttsVoice,
      input: text,
      instructions: buildTtsInstructions(voiceProfile.ttsDeliveryInstructions, styleHint),
      speed: 1.15,
      response_format: "pcm",
      stream_format: "audio",
    });

    if (!response.body) {
      return fail("TTS stream body was empty.", 502);
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/pcm",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    console.error("[ChatVoiceTTS] generation failed");
    return fail("TTS generation could not be completed.", 502);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type TtsStyleHint = "question" | "decision" | "risk" | "neutral";

function isTtsStyleHint(value: unknown): value is TtsStyleHint {
  return value === "question" || value === "decision" || value === "risk" || value === "neutral";
}

const CHAT_DELIVERY_INSTRUCTIONS =
  "Hızlı ve akıcı konuş; duraksamadan cümleden cümleye geç. Birden fazla cümle varsa her birini ayrı bir düşünce gibi söyle; liste gibi okuma.";

const TTS_STYLE_CLAUSES: Record<TtsStyleHint, string | null> = {
  neutral: null,
  question: "Bu cümle bir soru; cümle sonunda hafifçe yavaşla, cevap bekliyormuş gibi biraz havada birak.",
  decision: "Bu cümle bir karar veya tavsiye taşıyor; son kelimeyi ağırlaştır.",
  risk: "Bu cümlede risk var; anahtar kelimeye baskı yap — tona çıkma, aşağıya bas.",
};

function buildTtsInstructions(baseInstructions: string, styleHint: TtsStyleHint): string {
  const clause = TTS_STYLE_CLAUSES[styleHint];
  const instructions = `${baseInstructions} ${CHAT_DELIVERY_INSTRUCTIONS}`;
  return clause ? `${instructions} ${clause}` : instructions;
}
