/** Transport framing only. The Executive Agent chooses meaning and sources;
 * this decoder checks completed evidence references, never interprets business data. */
export type ProgressiveStage = "finding" | "connection" | "judgment" | "synthesis";
export type ProgressiveEvidenceReference = Readonly<{
  toolName: string; source: string; factScope: string; observedAt: string;
}>;
export type ProgressiveChunk = Readonly<{
  stage: ProgressiveStage; evidenceReferences: readonly ProgressiveEvidenceReference[];
}>;

// Explicit side-effect tools, not domain/intent routing. Their result narration
// stays with the existing final authority and readback checks.
const MUTATION_RESULT_TOOLS = new Set([
  "execute_business_action", "company_write", "log_field_visit_report",
  "submit_rep_goal_report", "propose_rep_request", "send_payment_reminder",
  "send_supplier_message", "notify_customer_creation_target",
  "compose_offer_whatsapp", "compose_payment_reminder_whatsapp",
  "generate_collections_artifact",
]);

export function completedEvidenceReference(toolName: string, result: unknown): ProgressiveEvidenceReference | null {
  // Mutations keep their existing final/readback narration authority. An
  // execution envelope's RESOLVED means the tool ran, not that a write passed.
  if (MUTATION_RESULT_TOOLS.has(toolName)) return null;
  let value = result;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.status !== "RESOLVED" || item.data == null || typeof item.source !== "string"
    || typeof item.factScope !== "string" || typeof item.observedAt !== "string") return null;
  return { toolName, source: item.source, factScope: item.factScope, observedAt: item.observedAt };
}

export class ProgressiveDelivery {
  private pending = "";
  private stage: ProgressiveStage = "synthesis";
  private references: ProgressiveEvidenceReference[] = [];
  private allowed = true;
  private content = "";
  constructor(
    private readonly evidence: ReadonlyMap<string, ProgressiveEvidenceReference>,
    private readonly emit: (text: string, chunk: ProgressiveChunk) => void,
  ) {}
  get text() { return this.content; }
  private publish(text: string) {
    if (!text || !this.allowed) return;
    this.content += text;
    this.emit(text, { stage: this.stage, evidenceReferences: this.references });
  }
  push(delta: string) {
    this.pending += delta;
    while (this.pending) {
      const start = this.pending.indexOf("[[");
      if (start === -1) {
        const keep = this.pending.endsWith("[") ? 1 : 0;
        this.publish(this.pending.slice(0, this.pending.length - keep));
        this.pending = keep ? "[" : "";
        return;
      }
      this.publish(this.pending.slice(0, start));
      this.pending = this.pending.slice(start);
      const end = this.pending.indexOf("]]");
      if (end === -1) return;
      const [stage, names = ""] = this.pending.slice(2, end).split(":");
      this.pending = this.pending.slice(end + 2);
      if (stage === "finding" || stage === "connection") {
        const sources = names.split(",").map((name) => this.evidence.get(name.trim()));
        this.allowed = sources.length >= (stage === "connection" ? 2 : 1) && sources.every(Boolean);
        this.stage = stage;
        this.references = this.allowed ? sources as ProgressiveEvidenceReference[] : [];
      } else if (stage === "judgment" || stage === "synthesis") {
        this.stage = stage;
        this.allowed = true;
        this.references = [];
      } else {
        // Unknown control frames are not spoken as business prose.
        this.allowed = false;
      }
    }
  }
  finish() {
    // Never speak a truncated control frame after abort/provider truncation.
    if (!this.pending.startsWith("[[")) this.publish(this.pending);
    this.pending = "";
  }
}

export const PROGRESSIVE_DELIVERY_INSTRUCTIONS = `
CANLI KONUŞMA TESLİMİ — AYNI EXECUTIVE AGENT
- Contextual entry zaten söylendiyse yeni giriş/ACK üretme. İlk şirket kanıtı gelene kadar sessizce gerekli tool'ları çağır; şirket gerçeği veya kanaat söyleme.
- Tool sonuçlarından sonra, hâlâ başka kanıt gerekiyorsa, mevcut güvenilir ilk bulguyu tek doğal cümleyle söyle ve gerekli tool çağrılarına aynı model turunda devam et. Bunun için fazladan araştırma veya model turu üretme; nihai kanaati erken kapatma.
- Kanıt yeterliyse yeni tur açma: aynı yanıtta önce temel gerçek bulguyu, sonra kanaat ve aksiyonu doğal devam olarak ilet.
- Ara bulgu metninin hemen önüne [[finding:tool_name]] kontrol çerçevesi koy. Yalnız bu koşudaki tamamlanmış RESOLVED, source/factScope/observedAt taşıyan kanıt envelope'larını kaynak göster. Birden çok kaynağa dayalı ara ilişkilendirmede [[connection:tool_name_1,tool_name_2]] kullan. Kaynakları model varsayımıyla doldurma. Kaynak kapsamı dışına çıkma. Bunlar kullanıcıya gösterilmeyen taşıma işaretleridir.
- Ara bulguda mutation başarısı anlatma; execute_business_action/company_write sonuçları ara bulgu kaynağı değildir. İşlemin sonucu yalnız nihai cevapta mevcut authoritative readback kurallarına göre anlatılır.
- Nihai yönetim kanaatinin başladığı yere [[judgment]], devamındaki aksiyon/sonuç bölümüne [[synthesis]] koy. Şirket kanaati olmayan sohbet/açıklama için işaret gerekmiyor.
- Her bölüm aynı konuşmanın devamıdır. Daha önce söylediğin entry ve bulguları yeniden başlatma veya kelimesi kelimesine tekrarlama. Yeni bağlantı, öncelik, gerekçe ve aksiyonu ekle. Final muhakemenin derinliğini, kanıt yeterliliğini veya kalitesini hız uğruna azaltma.
`;
