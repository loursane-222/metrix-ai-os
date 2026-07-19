import { validateCustomerCreatePlan, type CustomerCreatePlan, type CustomerCreatePlanFields } from "./customer-create-conversation-plan";

export type GenerateCustomerCreatePlanText = (input: { systemPrompt: string; userMessage: string }) => Promise<string>;
export function buildCustomerCreatePlanSystemPrompt(pendingFields: CustomerCreatePlanFields): string {
  return [
    "Sen yalnizca musteri olusturma komutlarini strict JSON plana ceviren dar bir siniflandiricisin.",
    "JSON disinda metin, markdown veya aciklama uretme.",
    "Izinli alanlar: displayName, legalName, phone, email, metrixNote. Baska alan, action, URL veya ID uretme.",
    "Kullanicinin Turkce degerlerini aynen koru; eksik deger uydurma.",
    "Kaydet/olustur/tamamla/kaydi baslat ifadelerini ancak acikca söylendiyse explicitCommit=true yap.",
    "Durum sorusu STATUS_QUERY, eksik alan sorusu MISSING_FIELDS_QUERY, vazgec/iptal CANCEL, ilgisiz mesaj NOT_CUSTOMER_CREATE.",
    "Desteklenmeyen bir alan (ornegin yetkili) istenirse CLARIFICATION_REQUIRED ve Turkce reason don; sessizce atma.",
    `Guvenli mevcut taslak alanlari: ${JSON.stringify(pendingFields)}. Bunlari cikti fields icinde tekrar etmen gerekmez.`,
    'CREATE semasi: {"kind":"CREATE_PLAN","intent":"OPEN|UPDATE_DRAFT|COMMIT|OPEN_UPDATE_COMMIT","fields":{},"explicitCommit":boolean}',
    'Diger semalar: {"kind":"STATUS_QUERY"}, {"kind":"MISSING_FIELDS_QUERY"}, {"kind":"CANCEL"}, {"kind":"NOT_CUSTOMER_CREATE"}, {"kind":"CLARIFICATION_REQUIRED","reason":"..."}.',
  ].join("\n");
}
const stripFence = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
export async function resolveCustomerCreatePlan(input: { utterance: string; pendingFields: CustomerCreatePlanFields; generateText: GenerateCustomerCreatePlanText }): Promise<CustomerCreatePlan> {
  try {
    const raw = await input.generateText({ systemPrompt: buildCustomerCreatePlanSystemPrompt(input.pendingFields), userMessage: input.utterance });
    const validated = validateCustomerCreatePlan(JSON.parse(stripFence(raw)));
    if (validated) return validated;
  } catch { /* deterministic safe fallback below */ }
  return extractObviousCustomerCreatePlan(input.utterance, Object.keys(input.pendingFields).length > 0);
}

export function extractObviousCustomerCreatePlan(utterance: string, hasPending = false): CustomerCreatePlan {
  const normalized = utterance.trim().toLocaleLowerCase("tr-TR");
  if (/\b(yetkili|irtibat kişisi|irtibat kisisi)\b/i.test(utterance)) return { kind: "CLARIFICATION_REQUIRED", reason: "Yetkili kisi yeni musteri formunda desteklenen bir alan degil." };
  if (/^(kaydettin mi|kaydedildi mi|işlem bitti mi|islem bitti mi|durum ne)[?.!]*$/i.test(normalized)) return { kind: "STATUS_QUERY" };
  if (/^(eksik ne kaldı|eksik ne kaldi|hangi bilgi eksik)[?.!]*$/i.test(normalized)) return { kind: "MISSING_FIELDS_QUERY" };
  if (/^(vazgeç|vazgec|iptal et|müşteri oluşturmayı iptal et|musteri olusturmayi iptal et)$/i.test(normalized)) return { kind: "CANCEL" };
  const open = /\b(yeni müşteri|yeni musteri|müşteri oluştur|musteri olustur|müşteri aç|musteri ac)\b/i.test(utterance);
  const commit = /\b(kaydet|kaydı başlat|kaydi baslat|kaydı tamamla|kaydi tamamla|bilgilerle devam et|bilgilerle kaydı başlat|bilgilerle kaydi baslat)\b/i.test(utterance);
  const fields: CustomerCreatePlanFields = {};
  const patterns: Array<[keyof CustomerCreatePlanFields, RegExp]> = [
    ["displayName", /(?:firma adı|firma adi)\s*(?:olarak|:)?\s*([^.,]+?)(?=\s+(?:olsun\b|yap(?=\s|[.,]|$))|[.,]|$)/i],
    ["displayName", /\b([^.,]+?)\s+adında\s+(?:yeni\s+)?müşteri\s+(?:aç|oluştur)/i],
    ["legalName", /(?:ticari unvanı|ticari unvani|ticari unvan)\s*(?:olarak|:)?\s*([^.,]+?)(?=\s+olsun\b|[.,]|$)/i],
    ["phone", /(?:telefonu|telefonunu|telefon)\s*(?:olarak|:)?\s*([+\d][\d\s()-]{6,})(?=\s+(?:olsun\b|yap(?=\s|[.,]|$))|[.,]|$)/i],
    ["email", /(?:e-posta adresi|e-posta|eposta)\s*(?:olarak|:)?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i],
    ["metrixNote", /(?:notu|not)\s*(?:olarak|:)?\s*([^.,]+?)(?=\s+olsun\b|[.,]|$)/i],
  ];
  for (const [field, pattern] of patterns) { const match = utterance.match(pattern); if (match?.[1]?.trim()) fields[field] = match[1].trim(); }
  if (!open && !commit && Object.keys(fields).length === 0) return hasPending && /^(devam et|yukarıdaki bilgilerle devam et|yukaridaki bilgilerle devam et)$/i.test(normalized) ? { kind: "CREATE_PLAN", intent: "UPDATE_DRAFT", fields: {}, explicitCommit: false } : { kind: "NOT_CUSTOMER_CREATE" };
  const intent = open && commit ? "OPEN_UPDATE_COMMIT" : commit ? "COMMIT" : open ? "OPEN" : "UPDATE_DRAFT";
  return { kind: "CREATE_PLAN", intent, fields, explicitCommit: commit };
}
