import OpenAI from "openai";

import { fail } from "@/lib/api/response";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";

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
    const client = new OpenAI({ apiKey });
    const response = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "onyx",
      input: text,
      instructions: buildTtsInstructions(styleHint),
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

const BASE_TTS_INSTRUCTIONS =
  "Türkçe konuş. 45-55 yaşında deneyimli bir genel müdürsün — sakin, otoriter, ama yorgun değil. Alçak, tok ses; alt registerde kal. Hızlı ve akıcı konuş; duraksamadan cümleden cümleye geç. Birden fazla cümle varsa her birini ayrı bir düşünce gibi söyle; liste gibi okuma. Coşkulu, sempatik veya heyecanlı ses çıkarma.";

const TTS_STYLE_CLAUSES: Record<TtsStyleHint, string | null> = {
  neutral: null,
  question: "Bu cümle bir soru; cümle sonunda hafifçe yavaşla, cevap bekliyormuş gibi biraz havada birak.",
  decision: "Bu cümle bir karar veya tavsiye taşıyor; son kelimeyi ağırlaştır.",
  risk: "Bu cümlede risk var; anahtar kelimeye baskı yap — tona çıkma, aşağıya bas.",
};

function buildTtsInstructions(styleHint: TtsStyleHint): string {
  const clause = TTS_STYLE_CLAUSES[styleHint];
  return clause ? `${BASE_TTS_INSTRUCTIONS} ${clause}` : BASE_TTS_INSTRUCTIONS;
}
