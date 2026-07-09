import OpenAI from "openai";

import { fail, ok } from "@/lib/api/response";
import {
  ApiValidationError,
  readJsonObject,
  requiredString,
} from "@/lib/api/validation";
import {
  authFail,
  requireAuthContextFromCookies,
} from "@/lib/auth/guards/api-auth-guard";
import { prisma } from "@/lib/core/shared/prisma";
import { VOICE_ACK_REQUESTED } from "@/lib/core/events/event-names";
import { recordEvent } from "@/lib/core/events/event.service";

// Deliberately independent of getAiProvider()/ai-gateway.ts: that path
// requires a MemoryContext (see GenerateResponseInput in
// src/lib/ai/providers/ai-provider.ts), which would mean either fabricating
// one or genuinely touching memory plumbing. This route calls the OpenAI
// SDK directly instead — the same low-level pattern already used by
// voice/tts/route.ts and voice/session/route.ts — so it has zero coupling
// to Executive Brain, memory, or conversation persistence. It never writes
// a conversation message; the caller treats its output as a transient,
// non-persisted presence signal.
const DEFAULT_ACK_MODEL = "gpt-4o-mini";
const ACK_MAX_TOKENS = 40;

const VOICE_ACK_RATE_LIMIT_MAX = 30;
const VOICE_ACK_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

const ACK_SYSTEM_PROMPT = [
  "Sen Metrix'sin, kullanicinin sirketinde gorev yapan AI Genel Mudur'sun.",
  "Kullanici az once konustu; sen su anda gercek cevabini hazirliyorsun.",
  "Ona SADECE cok kisa, dogal bir sozlu tepki ver — dinlendigini ve uzerinde calisildigini hissettir.",
  "Karar verme, analiz yapma, oneri veya tavsiye verme, soruyu cevaplama, bilgi verme.",
  "Tek kisa cumle, en fazla iki kisa cumle. Markdown kullanma, liste yapma.",
  "Ornekler (birebir tekrar etme, baglama gore dogal uret): 'Tamam, bakiyorum.' 'Haklisin, bir saniye.' 'Tamam, once ana tabloya bakalim.'",
].join(" ");

async function isVoiceAckRateLimited(params: {
  organizationId: string;
  actorUserId: string;
}): Promise<boolean> {
  const since = new Date(Date.now() - VOICE_ACK_RATE_LIMIT_WINDOW_MS);
  const recentCount = await prisma.event.count({
    where: {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      eventType: VOICE_ACK_REQUESTED,
      createdAt: { gte: since },
    },
  });

  return recentCount >= VOICE_ACK_RATE_LIMIT_MAX;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();

    const rateLimited = await isVoiceAckRateLimited({
      organizationId: authContext.organization.id,
      actorUserId: authContext.user.id,
    });
    if (rateLimited) {
      return fail("Çok fazla istek. Birkaç dakika sonra tekrar dener misin?", 429);
    }

    const body = await readJsonObject(request);
    const message = requiredString(body, "message").trim();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return fail("OPENAI_API_KEY is not configured.", 503);
    }

    const model = process.env.CHAT_VOICE_ACK_MODEL ?? DEFAULT_ACK_MODEL;

    await recordEvent({
      organizationId: authContext.organization.id,
      actorUserId: authContext.user.id,
      eventType: VOICE_ACK_REQUESTED,
      entityType: "VoiceAck",
      payload: { model },
      source: "USER",
    });

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model,
      max_tokens: ACK_MAX_TOKENS,
      messages: [
        { role: "system", content: ACK_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      return fail("Ack generation returned no content.", 502);
    }

    return ok({ text });
  } catch (error: unknown) {
    if (error instanceof ApiValidationError) {
      return fail(error.message, 400);
    }
    return authFail(error);
  }
}
