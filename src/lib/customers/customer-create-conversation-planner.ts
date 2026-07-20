import { validateCustomerCreatePlan, type CustomerCreatePlan, type CustomerCreatePlanFields } from "./customer-create-conversation-plan";
import { CUSTOMER_BUILT_IN_FIELDS } from "./customer-field-registry";
import { normalizeFieldValue } from "@/lib/field-authority/field-authority";
import type { CustomerCreateUnsupportedNotice } from "./customer-create-conversation-plan";
import { resolveCustomerCreateSemanticIntent } from "./customer-create-semantic-intent";

export type CustomerCreatePendingContext = { lifecycle: "OPENING" | "COLLECTING" | "READY"; fields: CustomerCreatePlanFields; missingFields: Array<"displayName"> } | null;

export type GenerateCustomerCreatePlanText = (input: { systemPrompt: string; userMessage: string }) => Promise<string>;
export function buildCustomerCreatePlanSystemPrompt(pendingContext: CustomerCreatePendingContext): string {
  return [
    "Sen müşteri oluşturma ve konuşma sırasında öğrenilen müşteri alanlarını strict JSON plana çeviren mevcut capture-source planner'sın.",
    "JSON disinda metin, markdown veya aciklama uretme.",
    `İzinli alanlar: ${JSON.stringify(CUSTOMER_BUILT_IN_FIELDS.filter((field) => field.writable).map(({ fieldId, label, valueType, aliases }) => ({ fieldId, key: fieldId.replace("customer.", ""), label, valueType, aliases })))}. Başka alan, action, URL veya ID üretme.`,
    "Kullanicinin Turkce degerlerini aynen koru; eksik deger uydurma.",
    "Kaydet/olustur/tamamla/kaydi baslat ifadelerini ancak acikca söylendiyse explicitCommit=true yap.",
    "Durum sorusu STATUS_QUERY, eksik alan sorusu MISSING_FIELDS_QUERY, vazgec/iptal CANCEL, ilgisiz mesaj NOT_CUSTOMER_CREATE.",
    "Registry içindeki yetkili kişi, adres, para birimi ve ticari koşul alanlarını fields içine koy. Yalnız registry dışı alanları unsupportedFields ile bildir.",
    "Var olan bir müşteri hakkında bilgi veriliyorsa operation UPDATE veya ENRICH ve entityReference üret. Yeni müşteri isteğinde operation CREATE kullan.",
    "Aktif yaşam döngüsünde yalnız displayName eksikse kısa ve güvenli şirket adı yanıtını displayName olarak doldur. Durum/iptal/kaydet veya ilgisiz komutları şirket adı sayma.",
    `Güvenli bekleyen bağlam: ${JSON.stringify(pendingContext)}. Alanları çıktıda tekrar etmen gerekmez.`,
    'Capture-source şeması: {"kind":"CREATE_PLAN","intent":"OPEN|UPDATE_DRAFT|COMMIT|OPEN_UPDATE_COMMIT","fields":{},"explicitCommit":boolean,"unsupportedFields":[],"operation":"CREATE|UPDATE|ENRICH","entityReference":"varsa müşteri adı/kodu"}',
    'Diger semalar: {"kind":"STATUS_QUERY"}, {"kind":"MISSING_FIELDS_QUERY"}, {"kind":"CANCEL"}, {"kind":"NOT_CUSTOMER_CREATE"}, {"kind":"CLARIFICATION_REQUIRED","reason":"..."}.',
  ].join("\n");
}
const stripFence = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
export async function resolveCustomerCreatePlan(input: { utterance: string; pendingContext: CustomerCreatePendingContext; generateText: GenerateCustomerCreatePlanText }): Promise<CustomerCreatePlan> {
  try {
    const raw = await input.generateText({ systemPrompt: buildCustomerCreatePlanSystemPrompt(input.pendingContext), userMessage: input.utterance });
    const validated = validateCustomerCreatePlan(JSON.parse(stripFence(raw)));
    if (validated) return applySemanticAuthority(validated, input.utterance, input.pendingContext, false);
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
  const fields = extractFieldsFromRegistry(utterance);
  const conversationalUpdate = utterance.match(/^(.+?)\s+artık\s+(.+?)\s+ile\s+çalışıyor[.!]?$/i);
  if (conversationalUpdate && !fields.currency) {
    const currency = resolveCurrency(conversationalUpdate[2]!);
    if (currency) fields.currency = currency;
  }
  if (!fields.displayName && context?.lifecycle && context.missingFields.length === 1 && context.missingFields[0] === "displayName") {
    const bare = contextualDisplayName(utterance);
    if (bare) fields.displayName = bare;
  }
  const preliminarySemantic = resolveCustomerCreateSemanticIntent(utterance, context, Object.keys(fields).length > 0);
  if (!fields.displayName && preliminarySemantic.operation === "CREATE" && preliminarySemantic.entityReference) fields.displayName = preliminarySemantic.entityReference;
  const semantic = resolveCustomerCreateSemanticIntent(utterance, context, Object.keys(fields).length > 0);
  const unsupportedFields: CustomerCreateUnsupportedNotice[] = [];
  if (semantic.stage === "STATUS_QUERY") return { kind: "STATUS_QUERY" };
  if (semantic.stage === "MISSING_FIELDS_QUERY") return { kind: "MISSING_FIELDS_QUERY" };
  if (semantic.stage === "CANCEL") return { kind: "CANCEL" };
  if (unsupportedFields.length && Object.keys(fields).length === 0 && semantic.operation === "UNKNOWN") return { kind: "CLARIFICATION_REQUIRED", reason: unsupportedFields[0]!.message };
  if (semantic.operation === "UNKNOWN" && Object.keys(fields).length === 0) return hasPending && /^(devam et|yukarıdaki bilgilerle devam et|yukaridaki bilgilerle devam et)$/i.test(normalized) ? semanticPlan("UPDATE_DRAFT", fields, false, "UPDATE", semantic, true) : { kind: "NOT_CUSTOMER_CREATE" };
  if (semantic.operation === "UNKNOWN" && !hasPending) return { kind: "NOT_CUSTOMER_CREATE" };
  const intent = semantic.stage === "COMMIT" ? "COMMIT" : semantic.explicitCommit ? "OPEN_UPDATE_COMMIT" : semantic.operation === "CREATE" ? "OPEN" : "UPDATE_DRAFT";
  return semanticPlan(intent, fields, semantic.explicitCommit, semantic.operation === "CREATE" ? "CREATE" : conversationalUpdate ? "ENRICH" : "UPDATE", semantic, true, semantic.entityReference ?? conversationalUpdate?.[1]?.trim());
}

function applySemanticAuthority(plan: CustomerCreatePlan, utterance: string, context: CustomerCreatePendingContext, fallbackUsed: boolean): CustomerCreatePlan {
  if (plan.kind !== "CREATE_PLAN") return plan;
  const semantic = resolveCustomerCreateSemanticIntent(utterance, context, Object.keys(plan.fields).length > 0);
  if (semantic.operation === "UNKNOWN") return plan;
  const explicitCommit = semantic.explicitCommit;
  const intent = semantic.stage === "COMMIT" ? "COMMIT" : explicitCommit ? "OPEN_UPDATE_COMMIT" : semantic.operation === "CREATE" ? "OPEN" : plan.intent;
  return { ...plan, intent, explicitCommit, operation: semantic.operation === "CREATE" ? "CREATE" : plan.operation, ...(semantic.entityReference ? { entityReference: semantic.entityReference } : {}), semantic: { domain: "customers", stage: semantic.stage, confidence: semantic.confidence, source: "PROVIDER", fallbackUsed, activeWorkflow: semantic.activeWorkflow } };
}

function semanticPlan(intent: Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }>["intent"], fields: CustomerCreatePlanFields, explicitCommit: boolean, operation: "CREATE" | "UPDATE" | "ENRICH", semantic: ReturnType<typeof resolveCustomerCreateSemanticIntent>, fallbackUsed: boolean, entityReference?: string): CustomerCreatePlan {
  return { kind: "CREATE_PLAN", intent, fields, explicitCommit, unsupportedFields: [], operation, ...(entityReference ? { entityReference } : {}), semantic: { domain: "customers", stage: semantic.stage, confidence: semantic.confidence, source: "DETERMINISTIC", fallbackUsed, activeWorkflow: semantic.activeWorkflow } };
}

function resolveCurrency(value: string): string | null { const normalized = value.trim().toLocaleLowerCase("tr-TR"); const aliases: Record<string, string> = { euro: "EUR", avro: "EUR", eur: "EUR", dolar: "USD", usd: "USD", sterlin: "GBP", gbp: "GBP", tl: "TRY", try: "TRY" }; return aliases[normalized] ?? null; }

function extractFieldsFromRegistry(utterance: string): CustomerCreatePlanFields {
  const result: CustomerCreatePlanFields = {}; const clauses = utterance.split(/[.!?](?:\s+|$)/).map((value) => value.trim()).filter(Boolean);
  const candidates = CUSTOMER_BUILT_IN_FIELDS.filter((field) => field.writable).flatMap((field) => (field.aliases ?? []).map((alias) => ({ field, alias }))).sort((a, b) => b.alias.length - a.alias.length);
  for (const clause of clauses) { const lower = clause.toLocaleLowerCase("tr-TR"); const candidate = candidates.find(({ alias }) => lower.includes(alias.toLocaleLowerCase("tr-TR"))); if (!candidate) continue; const index = lower.indexOf(candidate.alias.toLocaleLowerCase("tr-TR")); let raw = clause.slice(index + candidate.alias.length).replace(/^\s*(?:olarak|:|diye)?\s*/i, "").replace(/\s+(?:olacak|olsun|yap)$/i, "").trim(); if (candidate.field.valueType === "integer") raw = raw.replace(/\s*gün$/i, ""); if (!raw) continue; try { result[candidate.field.key as keyof CustomerCreatePlanFields] = normalizeFieldValue(candidate.field, raw) as never; } catch { /* provider remains primary; fallback keeps only safely normalized values */ } }
  return result;
}

function contextualDisplayName(utterance: string): string | null {
  if (/\?\s*$/.test(utterance)) return null;
  const text = utterance.trim().replace(/[.!?]+$/, "").trim();
  if (!text || text.length > 100 || text.split(/\s+/).length > 8 || /\b(kaydet|iptal|vazgeç|vazgec|durum|eksik|telefon|e-?posta|adres|not|sil|değiştir|degistir)\b/i.test(text)) return null;
  const value = text.replace(/^(?:firma(?:\s+(?:adı|adi|ismi))?|adı|adi)\s+/i, "").replace(/\s+(?:olacak|olsun)$/i, "").trim();
  return value && /[\p{L}\p{N}]/u.test(value) ? value : null;
}
