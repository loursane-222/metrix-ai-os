import { fail, ok } from "@/lib/api/response";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { prisma } from "@/lib/core/shared/prisma";
import { VOICE_SESSION_CREATED } from "@/lib/core/events/event-names";
import { recordEvent } from "@/lib/core/events/event.service";
import type { VoiceRealtimeSessionResponse } from "@/lib/onboarding/voice/realtime-session.types";
import {
  isVoiceNativeRealtimeEnabled,
  resolveNativeRealtimeVoiceFromEnv,
  shouldServerAutoInterruptResponse,
} from "@/lib/voice/voice-native-realtime-flag";

const REALTIME_CLIENT_SECRET_URL =
  "https://api.openai.com/v1/realtime/client_secrets";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2";

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
    // Faz 1A.2 — selectable via the CHAT_VOICE_REALTIME_VOICE env var
    // (Vercel), validated against the SDK-verified allowlist; falls back to
    // "cedar" for anything empty/invalid. See voice-native-realtime-flag.ts
    // for why this is not a NEXT_PUBLIC_-prefixed variable.
    const voice = resolveNativeRealtimeVoiceFromEnv();

    const nativeRealtimeEnabled = isVoiceNativeRealtimeEnabled();
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
            // Faz 1A.2 — Voice Identity. Delivery/tempo only (the voice ID
            // above governs the physical timbre; these govern rhythm and
            // presentation) — no persona or content rewrite.
            "Hızlı veya heyecanlı değil, ölçülü ve ağır bir tempoda konuş; cümleler arasında kısa doğal duraklar bırak.",
            "Sesini yapay şekilde kalınlaştırmaya veya yaşlı biri gibi taklit etmeye çalışma; doğal, tok, sakin bir yönetici tavrıyla konuş, aşırı teatral olma.",
          ].join("\n"),
          audio: {
            input: {
              transcription: {
                model:
                  process.env.CHAT_VOICE_TRANSCRIPTION_MODEL ??
                  "gpt-4o-mini-transcribe",
                language: "tr",
              },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "low",
                // Faz 1A.1 — Native Voice Runtime: gated by
                // NEXT_PUBLIC_VOICE_NATIVE_REALTIME_ENABLED. false (default)
                // keeps this session a pure STT transport, exactly as
                // before — the realtime API never generates a response, and
                // the existing Voice V4 HTTP pipeline (voice-v4-orchestrator.ts)
                // is what produces the assistant's reply. true lets the
                // server auto-create an assistant response (audio + text)
                // the instant server VAD decides the user's turn ended, so
                // the client must be prepared to receive and play it — see
                // useVoiceChatConnection.ts's ontrack/response.* handling.
                create_response: nativeRealtimeEnabled,
                // Native playback must not be truncated by VAD alone: the
                // always-live mic can hear Metrix's own speaker output. The
                // client validates interim/final text first and sends the
                // single response.cancel for a confirmed barge-in. Preserve
                // the pre-existing auto-interrupt policy while native mode
                // is off (the production HTTP/TTS path).
                interrupt_response:
                  shouldServerAutoInterruptResponse(nativeRealtimeEnabled),
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
