import OpenAI from "openai";

import { fail } from "@/lib/api/response";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { resolveVoiceAuthorityFromEnv } from "@/lib/voice/voice-preference-authority";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now();
  const requestId = crypto.randomUUID().slice(0, 8);
  const correlationId = safeTraceId(request.headers.get("X-Correlation-Id")) ?? requestId;
  const turnId = safeTraceId(request.headers.get("X-Turn-Id")) ?? undefined;
  const logTimeline = (event: string, extra?: Record<string, string | number | boolean | undefined>) => {
    console.info("[voice-tts][timeline]", JSON.stringify({
      event, requestId, correlationId, turnId,
      elapsedMs: Math.round(performance.now() - startedAt),
      ...extra,
    }));
  };
  logTimeline("tts_request_start");
  try {
    await requireAuthContextFromCookies();
    logTimeline("tts_auth_done");
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
  logTimeline("tts_body_parsed", { inputChars: text.length });

  if (!text) {
    return fail("text is required.", 400);
  }

  try {
    const voiceProfile = resolveVoiceAuthorityFromEnv("chat").profile;
    const client = new OpenAI({ apiKey });
    logTimeline("tts_provider_call_start", {
      provider: "openai",
      model: "gpt-4o-mini-tts",
      inputChars: text.length,
    });
    const response = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voiceProfile.ttsVoice,
      input: text,
      instructions: buildTtsInstructions(voiceProfile.ttsDeliveryInstructions, styleHint),
      speed: 1.15,
      response_format: "pcm",
      stream_format: "audio",
    });
    logTimeline("tts_provider_response_received", {
      provider: "openai",
      model: "gpt-4o-mini-tts",
    });

    if (!response.body) {
      return fail("TTS stream body was empty.", 502);
    }

    let firstByteLogged = false;
    const observedBody = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (!firstByteLogged) {
          firstByteLogged = true;
          logTimeline("tts_first_byte", { byteCount: chunk.byteLength });
        }
        controller.enqueue(chunk);
      },
      flush() {
        logTimeline("tts_request_done");
      },
    }));
    return new Response(observedBody, {
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

function safeTraceId(value: string | null): string | null {
  return value && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : null;
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
