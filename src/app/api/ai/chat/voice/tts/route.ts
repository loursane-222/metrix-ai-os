import OpenAI from "openai";

import { fail } from "@/lib/api/response";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { resolveVoiceAuthorityForUser } from "@/lib/voice/voice-preference-authority";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now();
  const requestId = crypto.randomUUID().slice(0, 8);
  const correlationId = safeTraceId(request.headers.get("X-Correlation-Id")) ?? requestId;
  const turnId = safeTraceId(request.headers.get("X-Turn-Id")) ?? undefined;
  const logTimeline = (event: string, extra?: Record<string, string | number | boolean | undefined>) => {
    console.info("[voice-tts][timeline]", JSON.stringify({
      event, requestId, correlationId, turnId,
      elapsedMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
      ...extra,
    }));
  };
  logTimeline("tts_request_start");
  let voicePreference: string | null;
  try {
    logTimeline("tts_auth_start");
    const authContext = await requireAuthContextFromCookies();
    voicePreference = authContext.user.voicePreference;
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
    const voiceProfile = resolveVoiceAuthorityForUser("chat", voicePreference).profile;
    let attempt = 0;
    // Observe the SDK's actual fetch boundary via its public constructor
    // option (the SDK's own `fetch` field is private post-construction) —
    // preserve its transport, options, retries and Response body without
    // reading or buffering that body here.
    const client = new OpenAI({
      apiKey,
      fetch: async (url, init) => {
        const requestAttempt = ++attempt;
        logTimeline("tts_provider_fetch_dispatched", {
          attempt: requestAttempt,
          requestBodyBytes: typeof init?.body === "string" ? new TextEncoder().encode(init.body).byteLength : undefined,
        });
        const response = await fetch(url, init);
        logTimeline("tts_provider_headers_received", { attempt: requestAttempt, httpStatus: response.status });
        return response;
      },
    });
    const instructions = buildTtsInstructions(voiceProfile.ttsDeliveryInstructions, styleHint);
    logTimeline("tts_provider_call_start", {
      provider: "openai",
      model: "gpt-4o-mini-tts",
      inputChars: text.length,
      instructionChars: instructions.length,
    });
    const response = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: voiceProfile.ttsVoice,
      input: text,
      instructions,
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
    logTimeline("tts_provider_body_available");

    let firstByteLogged = false;
    const observedBody = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        const firstChunk = !firstByteLogged;
        if (firstChunk) {
          firstByteLogged = true;
          logTimeline("tts_first_byte", { byteCount: chunk.byteLength });
        }
        controller.enqueue(chunk);
        if (firstChunk) logTimeline("tts_first_client_enqueue", { byteCount: chunk.byteLength });
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
