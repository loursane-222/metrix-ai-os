import { fail, ok } from "@/lib/api/response";
import type { VoiceRealtimeSessionResponse } from "@/lib/onboarding/voice/realtime-session.types";
import { resolveVoiceAuthorityFromEnv } from "@/lib/voice/voice-preference-authority";

const REALTIME_CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/client_secrets";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";

export async function POST(): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return fail("OPENAI_API_KEY is not configured.", 503);
  }

  const model =
    process.env.ONBOARDING_VOICE_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL;
  const voice = resolveVoiceAuthorityFromEnv("onboarding").realtimeVoice;

  try {
    const response = await fetch(REALTIME_CLIENT_SECRET_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": "metrix-onboarding-discovery",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions: [
            "Sen Metrix'sin. Bir şirkete işe alınmış, o şirketin içinden düşünen AI Genel Müdürsün.",
            "Sakin, ağırlıklı, kısa Türkçeyle konuş. Her turda tek soru sor; cevabı bekle.",
            "Empati performansı yapma. Amacın kullanıcıyı iyi hissettirmek değil, doğru kararı birlikte bulmak.",
          ].join("\n"),
          audio: {
            input: {
              transcription: {
                model:
                  process.env.ONBOARDING_VOICE_TRANSCRIPTION_MODEL ??
                  "gpt-4o-mini-transcribe",
                language: "tr",
              },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "high",
                create_response: false,
                interrupt_response: true,
              },
            },
            output: {
              voice,
            },
          },
        },
      }),
    });

    const data = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      return fail("Voice session could not be created.", 502);
    }

    const clientSecret = readClientSecret(data);

    if (!clientSecret) {
      return fail("Voice session response was invalid.", 502);
    }

    return ok({
      clientSecret,
      session: {
        model,
        voice,
        turnDetection: "semantic_vad",
        transcription: "enabled",
      },
    } satisfies VoiceRealtimeSessionResponse);
  } catch {
    return fail("Voice session could not be created.", 502);
  }
}

function readClientSecret(
  value: unknown,
): VoiceRealtimeSessionResponse["clientSecret"] | null {
  if (!isRecord(value)) {
    return null;
  }

  const secretValue = value.value;

  if (typeof secretValue !== "string" || !secretValue) {
    return null;
  }

  const expiresAt =
    typeof value.expires_at === "number" ? value.expires_at : null;

  return {
    value: secretValue,
    expiresAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
