import { fail, ok } from "@/lib/api/response";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { prisma } from "@/lib/core/shared/prisma";
import { VOICE_SESSION_CREATED } from "@/lib/core/events/event-names";
import { recordEvent } from "@/lib/core/events/event.service";
import type { VoiceRealtimeSessionResponse } from "@/lib/onboarding/voice/realtime-session.types";

const REALTIME_CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/client_secrets";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";
const DEFAULT_REALTIME_VOICE = "marin";

const VOICE_SESSION_RATE_LIMIT_MAX = 5;
const VOICE_SESSION_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

async function isVoiceSessionRateLimited(params: {
  organizationId: string;
  actorUserId: string;
}): Promise<boolean> {
  const since = new Date(Date.now() - VOICE_SESSION_RATE_LIMIT_WINDOW_MS);
  const recentSessionCount = await prisma.event.count({
    where: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      eventType: VOICE_SESSION_CREATED,
      createdAt: { gte: since },
    },
  });

  return recentSessionCount >= VOICE_SESSION_RATE_LIMIT_MAX;
}

export async function POST(): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();

    const rateLimited = await isVoiceSessionRateLimited({
      organizationId: authContext.organization.id,
      actorUserId: authContext.user.id,
    });
    if (rateLimited) {
      return fail(
        "Çok fazla sesli oturum isteği. Birkaç dakika sonra tekrar dener misin?",
        429,
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return fail("OPENAI_API_KEY is not configured.", 503);
    }

    const model = process.env.CHAT_VOICE_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL;
    const voice = process.env.CHAT_VOICE_REALTIME_VOICE ?? DEFAULT_REALTIME_VOICE;

    const response = await fetch(REALTIME_CLIENT_SECRET_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": `metrix-chat:${authContext.organization.id}`,
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions: [
            "Sen Metrix'sin. Şirketin AI Genel Müdürüsün.",
            "Sakin, ağırlıklı, kısa Türkçeyle konuş.",
          ].join("\n"),
          audio: {
            input: {
              transcription: {
                model:
                  process.env.CHAT_VOICE_TRANSCRIPTION_MODEL ??
                  "gpt-4o-mini-transcribe",
                language: "tr",
                prompt: "Metrix, AI Genel Müdür, Türkçe iş görüşmesi.",
              },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "low",
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

    await recordEvent({
      organizationId: authContext.organization.id,
      actorUserId: authContext.user.id,
      eventType: VOICE_SESSION_CREATED,
      entityType: "VoiceSession",
      payload: { model, voice },
      source: "USER",
    });

    return ok({
      clientSecret,
      session: {
        model,
        voice,
        turnDetection: "semantic_vad",
        transcription: "enabled",
      },
    } satisfies VoiceRealtimeSessionResponse);
  } catch (error: unknown) {
    return authFail(error);
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
