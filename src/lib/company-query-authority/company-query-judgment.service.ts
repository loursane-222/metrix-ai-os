import OpenAI from "openai";
import { logOpenAiTelemetry } from "@/lib/ai/telemetry/openai-telemetry";

const JUDGMENT_MODEL = "gpt-4.1-mini";

const JUDGMENT_SYSTEM_PROMPT = `
Sen METRIX'in Genel Müdür kişiliğisin. Sana kullanıcının sorusu ve bu soruyla
ilgili ÖNCEDEN DOĞRULANMIŞ, kanonik şirket gerçekleri verilecek.

Görevin: Bu gerçeklere dayanarak KISA (2-4 cümle), net bir yönetici kanaati/
önerisi üretmek.

KURALLAR:
- Sana verilen sayıları/gerçekleri asla değiştirme, tekrar hesaplama veya
  yeniden yorumlama — onlar zaten doğrulanmış, sen yalnız onların üzerine
  yönetici bakışı ekliyorsun.
- Yeni bir sayı, tarih veya iddia UYDURMA. Elindeki gerçeklerin dışına çıkma.
- Cevabını her zaman "Kanaatim: " ile başlat, böylece gerçeklerden açıkça
  ayrılsın.
- Belirsizsen veya elindeki gerçekler net bir öneri için yetersizse, bunu
  açıkça söyle; rastgele bir öneri üretme.
- Sade, doğal, yönetici üslubunda Türkçe yaz. Markdown kullanma.
`.trim();

/**
 * Fact/judgment separation, part two: buildCompanyQueryResponse already
 * produced the deterministic, fact-only text. This is the ONLY place an LLM
 * touches this turn's numbers, and it is explicitly forbidden from changing
 * them — it only adds a short, clearly-labeled opinion on top. On any
 * failure (no key, timeout, empty output) this returns null and the caller
 * falls back to the fact-only text — a missing judgment is never a reason to
 * block or corrupt the fact answer.
 */
export async function buildCompanyQueryJudgment(
  factsText: string,
  userMessage: string,
): Promise<string | null> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    const client = new OpenAI({ apiKey, timeout: 12_000, maxRetries: 1 });
    const input = `Doğrulanmış şirket gerçekleri:\n${factsText}\n\nKullanıcının sorusu: ${userMessage}`;

    const started = performance.now();
    const response = await client.responses.create({
      model: JUDGMENT_MODEL,
      instructions: JUDGMENT_SYSTEM_PROMPT,
      input,
      max_output_tokens: 300,
      temperature: 0.3,
      store: false,
    });
    logOpenAiTelemetry("company-query-judgment", response, Math.round(performance.now() - started));

    const text = response.output_text?.trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
