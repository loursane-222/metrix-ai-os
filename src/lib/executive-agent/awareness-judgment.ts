/**
 * Headless invocation of the METRIX Executive Agent for Stage 2 (Executive
 * Awareness / Always-On Watch). Same brain, same constitution, same model —
 * a second entry point into runtime.ts's canonical authority, not a second
 * authority. The only difference from the chat path: input is a pre-built
 * evidence bundle instead of a user message, output is a structured
 * disposition/significance judgment instead of a streamed reply, and no
 * tools are attached (the evidence bundle already carries everything the
 * judgment needs, which keeps this a single bounded LLM call per org per
 * watch cycle — Grand Consolidation §12 cost discipline).
 */

import { Agent, run } from "@openai/agents";
import { z } from "zod";
import { METRIX_EXECUTIVE_MODEL, METRIX_EXECUTIVE_REASONING_EFFORT } from "@/lib/ai/model-config";
import { EXECUTIVE_CONSTITUTION } from "./constitution";
import {
  AWARENESS_CATEGORIES,
  AWARENESS_SIGNIFICANCE,
  AWARENESS_URGENCY,
  type AwarenessEvidenceEnvelope,
  type AwarenessJudgment,
} from "@/lib/executive-autonomous-watch/executive-autonomous-watch.types";

const AwarenessJudgmentItemSchema = z.object({
  correlationTitle: z.string(),
  evidenceFingerprints: z.array(z.string()),
  disposition: z.enum(["SILENT", "INTERVENE"]),
  significance: z.enum(AWARENESS_SIGNIFICANCE),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  insight: z.string(),
  recommendedNextMove: z.string().nullable(),
  urgency: z.enum(AWARENESS_URGENCY),
  category: z.enum(AWARENESS_CATEGORIES),
  deliveryEligible: z.boolean(),
});

const AwarenessJudgmentOutputSchema = z.object({
  judgments: z.array(AwarenessJudgmentItemSchema),
});

const AWARENESS_JUDGMENT_INSTRUCTIONS = `
GÖREV: ARKA PLAN FARKINDALIK DEĞERLENDİRMESİ

Kullanıcı şu anda konuşmuyor. Sana şirketin güncel, deterministik olarak
tespit edilmiş kanıt listesi (EVIDENCE) veriliyor. Görevin bu kanıtı
Company Truth bağlamında değerlendirip şu soruyu cevaplamak:

"Bu kanıtın Genel Müdür tarafından fark edilmesi veya kullanıcıya
söylenmesi gerekiyor mu, yoksa sessiz mi kalınmalı?"

KURALLAR:
- Her kanıt öğesi kendi başına bir judgment gerektirmez. Önemsiz, gürültü
  seviyesinde veya zaten bilinen/rutin kanıtı gruplamaya veya raporlamaya
  ZORLANMA — sadece atla.
- Birbiriyle ilişkili kanıtları (aynı müşteri, aynı nakit baskısı hikayesi,
  aynı risk zinciri) TEK bir judgment altında birleştir. Üç ayrı tahsilat
  uyarısını üç ayrı judgment olarak döktürme; tek "nakit baskısı" hikayesi
  olarak birleştir.
- disposition SILENT birinci sınıf bir sonuçtur, başarısızlık değildir.
  Gerçekten önemli olmayan hiçbir şeyi INTERVENE olarak işaretleme.
- INTERVENE yalnız gerçekten kullanıcının bilmesi veya müdahale etmesi
  gereken durumlar için kullanılır.
- evidenceFingerprints alanına yalnız sana verilen kanıt listesindeki GERÇEK
  fingerprint değerlerini yaz; uydurma.
- insight alanı: kullanıcıya söylenecek son derece kısa, Executive üslubunda,
  Türkçe, kanıta dayalı tek bir cümle veya iki cümle. Süreç anlatma, doğrudan
  sonucu söyle.
- category alanı bildirim tercihi kategorisiyle eşleşmeli: KRİTİK olaylar
  için KRITIK, nakit/tahsilat/maliyet için FINANS, teklif/sipariş/müşteri
  için SATIS, operasyon/görev/takvim için GOREVLER.
- Yalnız gerçekten anlamlı bulduğun kanıt gruplarını raporla. Anlamsız
  kanıt için judgment üretme — boş dizi dönmek tamamen geçerlidir.
`;

export type RunAwarenessJudgmentInput = Readonly<{
  organizationId: string;
  organizationName: string;
  /** Compact, already-computed cross-domain narrative context (Grand
   * Consolidation §12: reuse existing evidence, never re-fetch Company
   * Truth for this call). May be null if unavailable. */
  companyNarrative: string | null;
  evidence: readonly AwarenessEvidenceEnvelope[];
}>;

export async function runAwarenessJudgment(input: RunAwarenessJudgmentInput): Promise<AwarenessJudgment[]> {
  if (input.evidence.length === 0) return [];

  const agent = new Agent({
    name: "METRIX Executive Agent (Awareness Judgment)",
    instructions: EXECUTIVE_CONSTITUTION + "\n" + AWARENESS_JUDGMENT_INSTRUCTIONS,
    model: METRIX_EXECUTIVE_MODEL,
    modelSettings: { reasoning: { effort: METRIX_EXECUTIVE_REASONING_EFFORT } },
    outputType: AwarenessJudgmentOutputSchema,
  });

  const prompt = buildAwarenessPrompt(input);

  const result = await run(agent, [{ type: "message", role: "user", content: prompt }], {
    stream: false,
    maxTurns: 1,
  });

  const output = result.finalOutput;
  if (!output) return [];

  const validFingerprints = new Set(input.evidence.map((e) => e.fingerprint));
  return output.judgments
    .map((judgment) => ({
      ...judgment,
      evidenceFingerprints: judgment.evidenceFingerprints.filter((fp) => validFingerprints.has(fp)),
    }))
    .filter((judgment) => judgment.evidenceFingerprints.length > 0);
}

function buildAwarenessPrompt(input: RunAwarenessJudgmentInput): string {
  const evidenceLines = input.evidence.map((e) =>
    JSON.stringify({
      fingerprint: e.fingerprint,
      domain: e.domain,
      severityHint: e.severityHint,
      headline: e.headline,
      detail: e.detail,
      observedAt: e.observedAt,
    }),
  );

  return [
    `Şirket: ${input.organizationName} (organizationId: ${input.organizationId})`,
    input.companyNarrative ? `Güncel şirket anlatımı: ${input.companyNarrative}` : null,
    "EVIDENCE:",
    ...evidenceLines,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
