import { validateCustomerCreatePlan, type CustomerCreatePlan, type CustomerCreatePlanFields } from "./customer-create-conversation-plan";
import { CUSTOMER_BUILT_IN_FIELDS } from "./customer-field-registry";
import { normalizeFieldValue } from "@/lib/field-authority/field-authority";
import type { CustomerCreateUnsupportedNotice } from "./customer-create-conversation-plan";

export type CustomerCreatePendingContext = { lifecycle: "OPENING" | "COLLECTING" | "READY"; fields: CustomerCreatePlanFields; missingFields: Array<"displayName"> } | null;

export type GenerateCustomerCreatePlanText = (input: { systemPrompt: string; userMessage: string }) => Promise<string>;
export function buildCustomerCreatePlanSystemPrompt(pendingContext: CustomerCreatePendingContext): string {
  return [
    "Sen yalnızca müşteri oluşturma komutlarını strict JSON plana çeviren dar bir sınıflandırıcısın.",
    "JSON disinda metin, markdown veya aciklama uretme.",
    `İzinli alanlar: ${JSON.stringify(CUSTOMER_BUILT_IN_FIELDS.filter((field) => field.writable).map(({ fieldId, label, valueType, aliases }) => ({ fieldId, key: fieldId.replace("customer.", ""), label, valueType, aliases })))}. Başka alan, action, URL veya ID üretme.`,
    "Kullanicinin Turkce degerlerini aynen koru; eksik deger uydurma.",
    "Kaydet/olustur/tamamla/kaydi baslat ifadelerini ancak acikca söylendiyse explicitCommit=true yap.",
    "Durum sorusu STATUS_QUERY, eksik alan sorusu MISSING_FIELDS_QUERY, vazgec/iptal CANCEL, ilgisiz mesaj NOT_CUSTOMER_CREATE.",
    "Registry içindeki yetkili kişi, adres, para birimi ve ticari koşul alanlarını fields içine koy. Yalnız registry dışı alanları unsupportedFields ile bildir.",
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
  const fields = extractFieldsFromRegistry(utterance);
  if (!fields.displayName && context?.lifecycle && context.missingFields.length === 1 && context.missingFields[0] === "displayName") {
    const bare = contextualDisplayName(utterance);
    if (bare) fields.displayName = bare;
  }
  const unsupportedFields: CustomerCreateUnsupportedNotice[] = [];
  if (unsupportedFields.length && Object.keys(fields).length === 0 && !open && !commit) return { kind: "CLARIFICATION_REQUIRED", reason: unsupportedFields[0]!.message };
  if (!open && !commit && Object.keys(fields).length === 0) return hasPending && /^(devam et|yukarıdaki bilgilerle devam et|yukaridaki bilgilerle devam et)$/i.test(normalized) ? { kind: "CREATE_PLAN", intent: "UPDATE_DRAFT", fields: {}, explicitCommit: false, unsupportedFields: [] } : { kind: "NOT_CUSTOMER_CREATE" };
  const intent = open && commit ? "OPEN_UPDATE_COMMIT" : commit ? "COMMIT" : open ? "OPEN" : "UPDATE_DRAFT";
  return { kind: "CREATE_PLAN", intent, fields, explicitCommit: commit, unsupportedFields };
}

function extractFieldsFromRegistry(utterance: string): CustomerCreatePlanFields {
  const result: CustomerCreatePlanFields = {}; const clauses = utterance.split(/[.!?](?:\s+|$)/).map((value) => value.trim()).filter(Boolean);
  const candidates = CUSTOMER_BUILT_IN_FIELDS.filter((field) => field.writable).flatMap((field) => (field.aliases ?? []).map((alias) => ({ field, alias }))).sort((a, b) => b.alias.length - a.alias.length);
  for (const clause of clauses) { const lower = clause.toLocaleLowerCase("tr-TR"); const candidate = candidates.find(({ alias }) => lower.includes(alias.toLocaleLowerCase("tr-TR"))); if (!candidate) continue; const index = lower.indexOf(candidate.alias.toLocaleLowerCase("tr-TR")); let raw = clause.slice(index + candidate.alias.length).replace(/^\s*(?:olarak|:|diye)?\s*/i, "").replace(/\s+(?:olacak|olsun|yap)$/i, "").trim(); if (candidate.field.valueType === "integer") raw = raw.replace(/\s*gün$/i, ""); if (!raw) continue; try { result[candidate.field.key as keyof CustomerCreatePlanFields] = normalizeFieldValue(candidate.field, raw) as never; } catch { /* provider remains primary; fallback keeps only safely normalized values */ } }
  return result;
}

function contextualDisplayName(utterance: string): string | null {
  const text = utterance.trim().replace(/[.!?]+$/, "").trim();
  if (!text || text.length > 100 || text.split(/\s+/).length > 8 || /\b(kaydet|iptal|vazgeç|vazgec|durum|eksik|telefon|e-?posta|adres|not|sil|değiştir|degistir)\b/i.test(text)) return null;
  const value = text.replace(/^(?:firma(?:\s+(?:adı|adi|ismi))?|adı|adi)\s+/i, "").replace(/\s+(?:olacak|olsun)$/i, "").trim();
  return value && /[\p{L}\p{N}]/u.test(value) ? value : null;
}
