import { validateCustomerCreatePlan, type CustomerCreatePlan, type CustomerCreatePlanFields } from "./customer-create-conversation-plan";
import { CUSTOMER_BUILT_IN_FIELDS } from "./customer-field-registry";
import { normalizeFieldValue } from "@/lib/field-authority/field-authority";
import type { CustomerCreateUnsupportedNotice } from "./customer-create-conversation-plan";
import { isProbableClause, resolveCustomerCreateSemanticIntent, splitCustomerClauses } from "./customer-create-semantic-intent";

export type CustomerCreatePendingContext = { lifecycle: "OPENING" | "COLLECTING" | "READY"; fields: CustomerCreatePlanFields; missingFields: Array<"displayName">; additionalNotificationTargets?: string[] } | null;

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
    "'Bunu Ahmet'e de bildir' gibi ek bildirim hedeflerini fields içine koyma; additionalNotificationTargets string dizisine kullanıcının hedef ifadesi olarak koy.",
    "Var olan bir müşteri hakkında bilgi veriliyorsa operation UPDATE veya ENRICH ve entityReference üret. Yeni müşteri isteğinde operation CREATE kullan.",
    "Aktif yaşam döngüsünde yalnız displayName eksikse kısa ve güvenli şirket adı yanıtını displayName olarak doldur. Durum/iptal/kaydet veya ilgisiz komutları şirket adı sayma.",
    `Güvenli bekleyen bağlam: ${JSON.stringify(pendingContext)}. Alanları çıktıda tekrar etmen gerekmez.`,
    'Capture-source şeması: {"kind":"CREATE_PLAN","intent":"OPEN|UPDATE_DRAFT|COMMIT|OPEN_UPDATE_COMMIT","fields":{},"explicitCommit":boolean,"unsupportedFields":[],"operation":"CREATE|UPDATE|ENRICH","entityReference":"varsa müşteri adı/kodu","additionalNotificationTargets":["varsa hedef ifade"]}',
    'Diger semalar: {"kind":"STATUS_QUERY"}, {"kind":"MISSING_FIELDS_QUERY"}, {"kind":"CANCEL"}, {"kind":"NOT_CUSTOMER_CREATE"}, {"kind":"CLARIFICATION_REQUIRED","reason":"..."}.',
  ].join("\n");
}
const stripFence = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
export async function resolveCustomerCreatePlan(input: { utterance: string; pendingContext: CustomerCreatePendingContext; generateText: GenerateCustomerCreatePlanText }): Promise<CustomerCreatePlan> {
  try {
    const raw = await input.generateText({ systemPrompt: buildCustomerCreatePlanSystemPrompt(input.pendingContext), userMessage: input.utterance });
    const validated = validateCustomerCreatePlan(JSON.parse(stripFence(raw)));
    if (validated) {
      const authoritative = applySemanticAuthority(validated, input.utterance, input.pendingContext, false);
      if (authoritative.kind !== "CREATE_PLAN" && hasPendingDisplayNameGap(input.pendingContext)) {
        const deterministic = extractObviousCustomerCreatePlan(input.utterance, input.pendingContext);
        if (deterministic.kind === "CREATE_PLAN" && deterministic.fields.displayName) return deterministic;
      }
      return authoritative;
    }
  } catch { /* deterministic safe fallback below */ }
  return extractObviousCustomerCreatePlan(input.utterance, input.pendingContext);
}

function hasPendingDisplayNameGap(pendingContext: CustomerCreatePendingContext): boolean {
  return Boolean(pendingContext && pendingContext.missingFields.length === 1 && pendingContext.missingFields[0] === "displayName");
}

export function extractObviousCustomerCreatePlan(utterance: string, pendingContext: CustomerCreatePendingContext | boolean = null): CustomerCreatePlan {
  const normalized = utterance.trim().toLocaleLowerCase("tr-TR");
  const customerUtterance = stripNotificationInstructions(utterance);
  const context = typeof pendingContext === "boolean" ? null : pendingContext;
  const hasPending = typeof pendingContext === "boolean" ? pendingContext : Boolean(context);
  if (/^(kaydettin mi|kaydedildi mi|işlem bitti mi|islem bitti mi|durum ne)[?.!]*$/i.test(normalized)) return hasPending ? { kind: "STATUS_QUERY" } : { kind: "NOT_CUSTOMER_CREATE" };
  if (/^(eksik ne kaldı|eksik ne kaldi|hangi bilgi eksik)[?.!]*$/i.test(normalized)) return hasPending ? { kind: "MISSING_FIELDS_QUERY" } : { kind: "NOT_CUSTOMER_CREATE" };
  if (/^(vazgeç|vazgec|iptal et|müşteri oluşturmayı iptal et|musteri olusturmayi iptal et)$/i.test(normalized)) return hasPending ? { kind: "CANCEL" } : { kind: "NOT_CUSTOMER_CREATE" };
  const fields = extractDeterministicCustomerFields(customerUtterance);
  const additionalNotificationTargets = extractAdditionalNotificationTargets(utterance);
  const assertedClauses = splitCustomerClauses(customerUtterance).filter((clause) => !isProbableClause(clause));
  const conversationalUpdate = assertedClauses.map((clause) => clause.match(/^(.+?)\s+artık\s+(.+?)\s+ile\s+çalışıyor\b/i)).find(Boolean);
  if (!fields.displayName && context?.lifecycle && context.missingFields.length === 1 && context.missingFields[0] === "displayName") {
    const bare = contextualDisplayName(utterance);
    if (bare) fields.displayName = bare;
  }
  const preliminarySemantic = resolveCustomerCreateSemanticIntent(customerUtterance, context, Object.keys(fields).length > 0);
  if (!fields.displayName && preliminarySemantic.operation === "CREATE" && preliminarySemantic.entityReference) fields.displayName = preliminarySemantic.entityReference;
  const semantic = resolveCustomerCreateSemanticIntent(customerUtterance, context, Object.keys(fields).length > 0);
  const unsupportedFields: CustomerCreateUnsupportedNotice[] = [];
  if (semantic.stage === "STATUS_QUERY") return { kind: "STATUS_QUERY" };
  if (semantic.stage === "MISSING_FIELDS_QUERY") return { kind: "MISSING_FIELDS_QUERY" };
  if (semantic.stage === "CANCEL") return { kind: "CANCEL" };
  if (unsupportedFields.length && Object.keys(fields).length === 0 && semantic.operation === "UNKNOWN") return { kind: "CLARIFICATION_REQUIRED", reason: unsupportedFields[0]!.message };
  if (semantic.operation === "UNKNOWN" && Object.keys(fields).length === 0) return hasPending && /^(devam et|yukarıdaki bilgilerle devam et|yukaridaki bilgilerle devam et)$/i.test(normalized) ? semanticPlan("UPDATE_DRAFT", fields, false, "UPDATE", semantic, true) : { kind: "NOT_CUSTOMER_CREATE" };
  if (semantic.operation === "UNKNOWN" && !hasPending) return { kind: "NOT_CUSTOMER_CREATE" };
  const intent = semantic.stage === "COMMIT" ? "COMMIT" : semantic.explicitCommit ? "OPEN_UPDATE_COMMIT" : semantic.operation === "CREATE" ? "OPEN" : "UPDATE_DRAFT";
  const resolved = semanticPlan(intent, fields, semantic.explicitCommit, semantic.operation === "CREATE" ? "CREATE" : conversationalUpdate ? "ENRICH" : "UPDATE", semantic, true, semantic.entityReference ?? conversationalUpdate?.[1]?.trim());
  return resolved.kind === "CREATE_PLAN" && additionalNotificationTargets.length ? { ...resolved, additionalNotificationTargets } : resolved;
}

function applySemanticAuthority(plan: CustomerCreatePlan, utterance: string, context: CustomerCreatePendingContext, fallbackUsed: boolean): CustomerCreatePlan {
  if (plan.kind !== "CREATE_PLAN") return plan;
  const customerUtterance = stripNotificationInstructions(utterance);
  const deterministicFields = extractDeterministicCustomerFields(customerUtterance);
  const additionalNotificationTargets = extractAdditionalNotificationTargets(utterance);
  const fields = { ...plan.fields, ...deterministicFields };
  const semantic = resolveCustomerCreateSemanticIntent(customerUtterance, context, Object.keys(fields).length > 0);
  if (semantic.operation === "UNKNOWN") return plan.operation === "CREATE" && context === null
    ? { kind: "NOT_CUSTOMER_CREATE" }
    : plan;
  const explicitCommit = semantic.explicitCommit;
  const intent = semantic.stage === "COMMIT" ? "COMMIT" : explicitCommit ? "OPEN_UPDATE_COMMIT" : semantic.operation === "CREATE" ? "OPEN" : plan.intent;
  const { entityReference: _providerEntityReference, ...planWithoutEntityReference } = plan;
  return { ...planWithoutEntityReference, fields, intent, explicitCommit, ...(additionalNotificationTargets.length ? { additionalNotificationTargets } : {}), operation: semantic.operation === "CREATE" ? "CREATE" : semantic.operation === "ENRICH" ? "ENRICH" : plan.operation, ...(semantic.entityReference ? { entityReference: semantic.entityReference } : {}), semantic: { domain: "customers", stage: semantic.stage, confidence: semantic.confidence, source: "PROVIDER", fallbackUsed, activeWorkflow: semantic.activeWorkflow, probableClauseCount: semantic.probableClauseCount } };
}

function semanticPlan(intent: Extract<CustomerCreatePlan, { kind: "CREATE_PLAN" }>["intent"], fields: CustomerCreatePlanFields, explicitCommit: boolean, operation: "CREATE" | "UPDATE" | "ENRICH", semantic: ReturnType<typeof resolveCustomerCreateSemanticIntent>, fallbackUsed: boolean, entityReference?: string): CustomerCreatePlan {
  return { kind: "CREATE_PLAN", intent, fields, explicitCommit, unsupportedFields: [], operation, ...(entityReference ? { entityReference } : {}), semantic: { domain: "customers", stage: semantic.stage, confidence: semantic.confidence, source: "DETERMINISTIC", fallbackUsed, activeWorkflow: semantic.activeWorkflow, probableClauseCount: semantic.probableClauseCount } };
}

export function extractAdditionalNotificationTargets(utterance: string): string[] {
  const matches = [...utterance.matchAll(/(?:\bve\s+)?\bbunu\s+(.+?)\s+(?:de\s+)?bildir\b/giu)];
  return [...new Set(matches.map((match) => match[1]?.trim()).filter((target): target is string => Boolean(target)))].slice(0, 5);
}

function stripNotificationInstructions(utterance: string): string {
  return utterance.replace(/(?:\bve\s+)?\bbunu\s+.+?\s+(?:de\s+)?bildir\b/giu, "").replace(/\s+([,.;])/gu, "$1").replace(/\s{2,}/gu, " ").trim();
}

function resolveCurrency(value: string): string | null { const normalized = value.trim().toLocaleLowerCase("tr-TR"); const aliases: Record<string, string> = { euro: "EUR", avro: "EUR", eur: "EUR", dolar: "USD", usd: "USD", sterlin: "GBP", gbp: "GBP", tl: "TRY", try: "TRY" }; return aliases[normalized] ?? null; }

function extractDeterministicCustomerFields(utterance: string): CustomerCreatePlanFields {
  const fields = extractFieldsFromRegistry(utterance);
  const assertedClauses = splitCustomerClauses(utterance).filter((clause) => !isProbableClause(clause));
  const conversationalUpdate = assertedClauses.map((clause) => clause.match(/^(.+?)\s+artık\s+(.+?)\s+ile\s+çalışıyor\b/i)).find(Boolean);
  if (conversationalUpdate && !fields.currency) {
    const currency = resolveCurrency(conversationalUpdate[2]!);
    if (currency) fields.currency = currency;
  }
  return fields;
}

function extractFieldsFromRegistry(utterance: string): CustomerCreatePlanFields {
  const result: CustomerCreatePlanFields = {}; const clauses = splitCustomerClauses(utterance).filter((clause) => !isProbableClause(clause));
  const candidates = CUSTOMER_BUILT_IN_FIELDS.filter((field) => field.writable).flatMap((field) => (field.aliases ?? []).map((alias) => ({ field, alias }))).sort((a, b) => b.alias.length - a.alias.length);
  for (const clause of clauses) { const lower = clause.toLocaleLowerCase("tr-TR"); const candidate = candidates.find(({ alias }) => lower.includes(alias.toLocaleLowerCase("tr-TR"))); if (!candidate) continue; const index = lower.indexOf(candidate.alias.toLocaleLowerCase("tr-TR")); let raw = clause.slice(index + candidate.alias.length).replace(/^\s*(?:n[ıiuü]|olarak|:|diye)?\s*/i, "").replace(/\s+(?:oldu|olacak|olsun|yap)$/i, "").trim(); if (candidate.field.valueType === "integer") raw = raw.replace(/\s*gün$/i, ""); if (!raw) continue; try { result[candidate.field.key as keyof CustomerCreatePlanFields] = normalizeFieldValue(candidate.field, raw) as never; } catch { /* provider remains primary; fallback keeps only safely normalized values */ } }
  for (const clause of clauses) {
    const paymentTerm = clause.match(/(?:ödeme\s+)?vade(?:si)?(?:\s+de)?\s+(\d+)\s*gün(?:\s+oldu)?/iu);
    if (paymentTerm) result["commercialTerms.paymentTermDays"] = Number(paymentTerm[1]);
  }
  const phone = utterance.match(/(?:^|[,.;]\s*)telefon\s*:?[\s]*(05\d{2}(?:[\s()-]*\d){7})\b/iu);
  if (phone) {
    const field = CUSTOMER_BUILT_IN_FIELDS.find((candidate) => candidate.key === "phone");
    if (field) {
      try { result.phone = normalizeFieldValue(field, phone[1]) as string; } catch { /* keep provider as the fallback */ }
    }
  }
  return result;
}

function contextualDisplayName(utterance: string): string | null {
  if (/\?\s*$/.test(utterance)) return null;
  const text = utterance.trim().replace(/[.!?]+$/, "").trim();
  if (!text || text.length > 100 || text.split(/\s+/).length > 8 || /\b(kaydet|iptal|vazgeç|vazgec|durum|eksik|telefon|e-?posta|adres|not|sil|değiştir|degistir)\b/i.test(text)) return null;
  const value = text.replace(/^(?:firma(?:\s+(?:adı|adi|ismi))?|adı|adi)\s+/i, "").replace(/\s+(?:olacak|olsun)$/i, "").trim();
  return value && /[\p{L}\p{N}]/u.test(value) ? value : null;
}
