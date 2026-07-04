import OpenAI from "openai";

import { fail } from "@/lib/api/response";

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return fail("TTS is not configured.", 503);
  }

  let text: string;
  try {
    const body = (await request.json()) as unknown;
    text = isRecord(body) && typeof body.text === "string" ? body.text.trim() : "";
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
      instructions:
        "Türkçe konuş. 45-55 yaşında deneyimli bir genel müdürsün — sakin, otoriter, ama yorgun değil. Alçak, tok ses; alt registerde kal. Hızlı ve akıcı konuş; duraksamadan cümleden cümleye geç. Soru sorarken cümle sonunda hafifçe yavaşla; cevap bekliyorsun. Karar verirken son kelimeyi ağırlaştır. Risk anlatırken anahtar kelimeye baskı yap — tona çıkma, aşağıya bas. Birden fazla cümle varsa her birini ayrı bir düşünce gibi söyle; liste gibi okuma. Coşkulu, sempatik veya heyecanlı ses çıkarma.",
      speed: 1.15,
      response_format: "mp3",
    });

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    console.error("[TTS] generation failed");
    return fail("TTS generation could not be completed.", 502);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
