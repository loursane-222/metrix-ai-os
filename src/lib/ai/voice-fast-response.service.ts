import OpenAI from "openai";

import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";
import type { ContinuityTransformationKind } from "@/lib/conversation-understanding";

// Voice V4 Fast Presence / Conversation Continuity generation. Deliberately
// independent of streamWithAiGateway(): that path always builds the full
// Executive Operating Context (directors, quote/payment/collection context,
// council activation) before it produces a single token, which is exactly
// the blocking chain V4 Faz 1 removes from the voice critical path. This
// module calls the OpenAI SDK directly instead — the same low-level pattern
// already used by voice/ack/route.ts — with a small, purpose-built system
// prompt per mode instead of the full Metrix prompt stack.
//
// These prompts are instructions to the model, not canned reply text: no
// example sentence here is ever echoed to a user verbatim. What is fixed is
// the DECISION each mode encodes (what to preserve, what to ground in, what
// to avoid), not the words of the response.
//
// Output is streamed raw, unsanitized, exactly like streamWithAiGateway's
// textStream — sanitizeExecutiveManagerResponse is applied by the caller
// once the full content is available, matching the existing chat route's
// division of labor between streamed chunks and the sanitized "done" event.

const DEFAULT_VOICE_FAST_MODEL = "gpt-4o-mini";
const VOICE_FAST_MAX_TOKENS = 300;

function resolveVoiceFastModel(): string {
  return process.env.CHAT_VOICE_FAST_MODEL ?? DEFAULT_VOICE_FAST_MODEL;
}

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return new OpenAI({ apiKey });
}

export type VoiceFastStreamHandle = {
  model: string;
  textStream: AsyncGenerator<string>;
  getFinalContent: () => Promise<string>;
};

async function* streamChatCompletion(
  client: OpenAI,
  params: { model: string; systemPrompt: string; userMessage: string },
): AsyncGenerator<string> {
  const completion = await client.chat.completions.create({
    model: params.model,
    max_tokens: VOICE_FAST_MAX_TOKENS,
    stream: true,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userMessage },
    ],
  });

  for await (const part of completion) {
    const delta = part.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

function createStreamHandle(params: {
  model: string;
  systemPrompt: string;
  userMessage: string;
}): VoiceFastStreamHandle {
  const client = getOpenAiClient();
  let resolveFinal: (content: string) => void;
  let rejectFinal: (error: unknown) => void;
  const finalContentPromise = new Promise<string>((resolve, reject) => {
    resolveFinal = resolve;
    rejectFinal = reject;
  });

  async function* wrapped(): AsyncGenerator<string> {
    let accumulated = "";
    try {
      for await (const delta of streamChatCompletion(client, params)) {
        accumulated += delta;
        yield delta;
      }
      resolveFinal(accumulated);
    } catch (error) {
      rejectFinal(error);
      throw error;
    }
  }

  return {
    model: params.model,
    textStream: wrapped(),
    getFinalContent: () => finalContentPromise,
  };
}

const TRANSFORMATION_INSTRUCTIONS: Record<ContinuityTransformationKind, string> = {
  simplify:
    "Kullanici bu cevabi daha sade anlatmani istiyor. Ayni kanaati ve karar yonunu koru; daha basit kelimelerle, daha kisa cumlelerle yeniden ifade et. Yeni analiz veya yeni bilgi ekleme.",
  shorten:
    "Kullanici bu cevabi kisaltmani istiyor. Ayni kanaati koru; sadece en kritik noktayi bir iki cumlede ver.",
  repeat:
    "Kullanici bu cevabi tekrar etmeni istiyor. Ayni icerigi ve kanaati koru; birebir ayni cumleleri kullanmak zorunda degilsin ama anlami degistirme.",
  expand:
    "Kullanici bu konuyu biraz daha acmani istiyor. Ayni kanaati koru; gerekceni biraz daha detaylandir, ama yeni bir analiz baslatma.",
  rephrase:
    "Kullanici ayni seyi baska turlu soylemeni istiyor. Ayni kanaati koru; farkli kelimeler ve farkli bir cumle yapisiyla yeniden ifade et.",
  clarify:
    "Kullanici bu cevabi daha net soylemeni istiyor. Ayni kanaati koru; belirsizligi azalt, dogrudan ve acik konus.",
};

function describePreviousReasoning(state: ExecutiveConversationState | null): string[] {
  if (!state) return [];
  const lines: string[] = [];
  if (state.lastRecommendationTitle) {
    lines.push(`Kararinin ozu: ${state.lastRecommendationTitle}`);
  }
  if (state.lastRecommendationRationale) {
    lines.push(`Gerekcen: ${state.lastRecommendationRationale}`);
  }
  return lines;
}

export function generateVoiceContinuityResponse(input: {
  userMessage: string;
  previousAiMessageContent: string;
  previousConversationState: ExecutiveConversationState | null;
  transformationKind: ContinuityTransformationKind;
}): VoiceFastStreamHandle {
  const reasoningLines = describePreviousReasoning(input.previousConversationState);

  const systemPrompt = [
    "Sen Metrix'sin, kullanicinin sirketinde gorev yapan AI Genel Mudur'sun.",
    "Az once asagidaki cevabi verdin:",
    `"${input.previousAiMessageContent}"`,
    ...(reasoningLines.length > 0 ? ["", ...reasoningLines] : []),
    "",
    TRANSFORMATION_INSTRUCTIONS[input.transformationKind],
    "",
    "Yeni bir muhakeme baslatma. Kullanici acikca yeni bir degerlendirme istemedikce karar yonunu degistirme.",
    "Turkce, dogal, sozlu konusma diliyle cevap ver. Markdown, baslik veya madde isareti kullanma.",
    "Kisa cumleler kur; bir cumle bir dusunce olsun.",
    "Ic sistem, hafiza, metadata, guven skoru, kategori gibi teknik terimleri asla kullanma.",
  ].join("\n");

  return createStreamHandle({
    model: resolveVoiceFastModel(),
    systemPrompt,
    userMessage: input.userMessage,
  });
}

export function generateVoiceFastPresenceResponse(input: {
  userMessage: string;
  organizationSummary: string;
  memorySnapshotLines: string[];
}): VoiceFastStreamHandle {
  const memorySection =
    input.memorySnapshotLines.length > 0
      ? ["Bilinen bazi sirket bilgileri:", ...input.memorySnapshotLines.map((line) => `- ${line}`)]
      : [];

  const systemPrompt = [
    "Sen Metrix'sin. Kullanicinin sirketinde gorev yapan AI Genel Mudur'sun.",
    "Kendini asistan, bot veya operasyon asistani olarak tanimlama.",
    "Kullaniciyla gercek bir insan genel mudur gibi konus: sakin, olgun, durust ve yol gosterici.",
    "Her zaman Turkce konus.",
    "",
    "Bu, toplantinin devam eden bir konusma anidir; rapor degil.",
    "Markdown kullanma. Baslik, numarali/madde isaretli liste, ** veya # gibi bicimlendirme uretme.",
    "Kisa cumleler kur; bir cumle bir dusunce olsun.",
    "Once kullanicinin sorusuna dogrudan cevap ver.",
    "",
    "Sirket ozeti:",
    input.organizationSummary,
    ...(memorySection.length > 0 ? ["", ...memorySection] : []),
    "",
    "Elindeki bilgiyle dogrudan ve kisa cevap ver.",
    "Spesifik rakam, isim veya kayit gerektiren ama sana verilmemis bir detay istenirse uydurma; bunu bilmedigini soyle ve tek bir netlestirici soru sor.",
    "Bu senin ilk tepkin, daha derin analiz sonradan gelebilir; bunu kullaniciya anlatma, sadece dogal ve yeterli bir ilk cevap ver.",
    "Ic sistem, hafiza, metadata, guven skoru, kategori, director, konsey gibi teknik terimleri asla kullanma.",
  ].join("\n");

  return createStreamHandle({
    model: resolveVoiceFastModel(),
    systemPrompt,
    userMessage: input.userMessage,
  });
}
