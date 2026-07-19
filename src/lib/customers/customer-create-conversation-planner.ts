import { validateCustomerCreatePlan, type CustomerCreatePlan, type CustomerCreatePlanFields } from "./customer-create-conversation-plan";

export type CustomerCreatePendingContext = { lifecycle: "OPENING" | "COLLECTING" | "READY"; fields: CustomerCreatePlanFields; missingFields: Array<"displayName"> } | null;

export type GenerateCustomerCreatePlanText = (input: { systemPrompt: string; userMessage: string }) => Promise<string>;
export function buildCustomerCreatePlanSystemPrompt(pendingContext: CustomerCreatePendingContext): string {
  return [
    "Sen yalnızca müşteri oluşturma komutlarını strict JSON plana çeviren dar bir sınıflandırıcısın.",
    "JSON disinda metin, markdown veya aciklama uretme.",
    "Izinli alanlar: displayName, legalName, phone, email, metrixNote. Baska alan, action, URL veya ID uretme.",
    "Kullanicinin Turkce degerlerini aynen koru; eksik deger uydurma.",
    "Kaydet/olustur/tamamla/kaydi baslat ifadelerini ancak acikca söylendiyse explicitCommit=true yap.",
    "Durum sorusu STATUS_QUERY, eksik alan sorusu MISSING_FIELDS_QUERY, vazgec/iptal CANCEL, ilgisiz mesaj NOT_CUSTOMER_CREATE.",
    "Desteklenmeyen yetkili/irtibat kişisini primaryContact bildirimi olarak unsupportedFields içine koy. Desteklenen alanları mutlaka koru; bildirim onları geçersiz kılmaz.",
    "Aktif yaşam döngüsünde yalnız displayName eksikse kısa ve güvenli şirket adı yanıtını displayName olarak doldur. Durum/iptal/kaydet veya ilgisiz komutları şirket adı sayma.",
    `Güvenli bekleyen bağlam: ${JSON.stringify(pendingContext)}. Alanları çıktıda tekrar etmen gerekmez.`,
    'CREATE şeması: {"kind":"CREATE_PLAN","intent":"OPEN|UPDATE_DRAFT|COMMIT|OPEN_UPDATE_COMMIT","fields":{},"explicitCommit":boolean,"unsupportedFields":[{"field":"primaryContact","userLabel":"yetkili","message":"Yetkili kişi bu formda henüz desteklenmiyor."}]}',
    'Diger semalar: {"kind":"STATUS_QUERY"}, {"kind":"MISSING_FIELDS_QUERY"}, {"kind":"CANCEL"}, {"kind":"NOT_CUSTOMER_CREATE"}, {"kind":"CLARIFICATION_REQUIRED","reason":"..."}.',
  ].join("\n");
}
const stripFence = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
export async function resolveCustomerCreatePlan(input: { utterance: string; pendingContext: CustomerCreatePendingContext; generateText: GenerateCustomerCreatePlanText }): Promise<CustomerCreatePlan> {
  try {
    const raw = await input.generateText({ systemPrompt: buildCustomerCreatePlanSystemPrompt(input.pendingContext), userMessage: input.utterance });
    const validated = validateCustomerCreatePlan(JSON.parse(stripFence(raw)));
    if (validated) return validated;
  } catch { /* deterministic safe fallback below */ }
  return extractObviousCustomerCreatePlan(input.utterance, input.pendingContext);
}

export function extractObviousCustomerCreatePlan(utterance: string, pendingContext: CustomerCreatePendingContext | boolean = null): CustomerCreatePlan {
  const normalized = utterance.trim().toLocaleLowerCase("tr-TR");
  const context = typeof pendingContext === "boolean" ? null : pendingContext;
  const hasPending = typeof pendingContext === "boolean" ? pendingContext : Boolean(context);
  if (/^(kaydettin mi|kaydedildi mi|işlem bitti mi|islem bitti mi|durum ne)[?.!]*$/i.test(normalized)) return { kind: "STATUS_QUERY" };
  if (/^(eksik ne kaldı|eksik ne kaldi|hangi bilgi eksik)[?.!]*$/i.test(normalized)) return { kind: "MISSING_FIELDS_QUERY" };
  if (/^(vazgeç|vazgec|iptal et|müşteri oluşturmayı iptal et|musteri olusturmayi iptal et)$/i.test(normalized)) return { kind: "CANCEL" };
  const open = /\b(yeni müşteri|yeni musteri|müşteri oluştur|musteri olustur|müşteri aç|musteri ac)\b/i.test(utterance);
  const commit = /\b(kaydet|kaydı başlat|kaydi baslat|kaydı tamamla|kaydi tamamla|bilgilerle devam et|bilgilerle kaydı başlat|bilgilerle kaydi baslat)\b/i.test(utterance);
  const fields: CustomerCreatePlanFields = {};
  const patterns: Array<[keyof CustomerCreatePlanFields, RegExp]> = [
    ["displayName", /(?:firma(?:\s+(?:adı|adi|ismi))?|adı|adi)\s*(?:olarak|:)?\s*([^.,]+?)(?=\s+(?:olacak|olsun\b|yap(?=\s|[.,]|$))|[.,]|$)/i],
    ["displayName", /\b([^.,]+?)\s+adında\s+(?:yeni\s+)?müşteri\s+(?:aç|oluştur)/i],
    ["legalName", /(?:ticari unvanı|ticari unvani|ticari unvan)\s*(?:olarak|:)?\s*([^.,]+?)(?=\s+olsun\b|[.,]|$)/i],
    ["phone", /(?:telefonu|telefonunu|telefon)\s*(?:olarak|:)?\s*([+\d][\d\s()-]{6,})(?=\s+(?:olsun\b|yap(?=\s|[.,]|$))|[.,]|$)/i],
    ["email", /(?:e-posta adresi|e-posta|eposta)\s*(?:olarak|:)?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i],
    ["metrixNote", /(?:notu|not)\s*(?:olarak|:)?\s*([^.,]+?)(?=\s+olsun\b|[.,]|$)/i],
  ];
  for (const [field, pattern] of patterns) { const match = utterance.match(pattern); if (match?.[1]?.trim()) fields[field] = match[1].trim(); }
  if (!fields.displayName && context?.lifecycle && context.missingFields.length === 1 && context.missingFields[0] === "displayName") {
    const bare = contextualDisplayName(utterance);
    if (bare) fields.displayName = bare;
  }
  const unsupportedFields = /\b(yetkili(?:si)?|irtibat kişisi|irtibat kisisi)\b/i.test(utterance)
    ? [{ field: "primaryContact" as const, userLabel: "yetkili", message: "Yetkili kişi bu formda henüz desteklenmiyor." }]
    : [];
  if (unsupportedFields.length && Object.keys(fields).length === 0 && !open && !commit) return { kind: "CLARIFICATION_REQUIRED", reason: unsupportedFields[0]!.message };
  if (!open && !commit && Object.keys(fields).length === 0) return hasPending && /^(devam et|yukarıdaki bilgilerle devam et|yukaridaki bilgilerle devam et)$/i.test(normalized) ? { kind: "CREATE_PLAN", intent: "UPDATE_DRAFT", fields: {}, explicitCommit: false, unsupportedFields: [] } : { kind: "NOT_CUSTOMER_CREATE" };
  const intent = open && commit ? "OPEN_UPDATE_COMMIT" : commit ? "COMMIT" : open ? "OPEN" : "UPDATE_DRAFT";
  return { kind: "CREATE_PLAN", intent, fields, explicitCommit: commit, unsupportedFields };
}

function contextualDisplayName(utterance: string): string | null {
  const text = utterance.trim().replace(/[.!?]+$/, "").trim();
  if (!text || text.length > 100 || text.split(/\s+/).length > 8 || /\b(kaydet|iptal|vazgeç|vazgec|durum|eksik|telefon|e-?posta|adres|not|sil|değiştir|degistir)\b/i.test(text)) return null;
  const value = text.replace(/^(?:firma(?:\s+(?:adı|adi|ismi))?|adı|adi)\s+/i, "").replace(/\s+(?:olacak|olsun)$/i, "").trim();
  return value && /[\p{L}\p{N}]/u.test(value) ? value : null;
}
