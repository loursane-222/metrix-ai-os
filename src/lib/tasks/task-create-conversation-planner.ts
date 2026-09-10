import { validateTaskCreatePlan, type TaskCreatePlan, type TaskCreatePlanFields } from "./task-create-conversation-plan";

// Text-only self-reference detection (this module runs client-side, so it
// cannot import member-name-resolution.ts — that module pulls in the
// Prisma-backed organization-member repository). This is NOT identity
// resolution: it only classifies the utterance so assigneeReference can
// carry "SELF" downstream. The actual user id is resolved exactly once,
// server-side, by the canonical resolveRepByName/resolveEntityReference
// authority in create-command/route.ts — see "Member / Assignee Authority".
const SELF_REFERENCE_WORDS = /\b(bana|kendim|kendime|kendi[mn]e)\b/i;

export type TaskCreatePendingContext = { lifecycle: "OPENING" | "COLLECTING" | "READY"; fields: TaskCreatePlanFields } | null;

export type GenerateTaskCreatePlanText = (input: { systemPrompt: string; userMessage: string }) => Promise<string>;

export function buildTaskCreatePlanSystemPrompt(pendingContext: TaskCreatePendingContext): string {
  return [
    "Sen görev oluşturma konuşmasını strict JSON plana çeviren capture-source planner'sın.",
    "JSON disinda metin, markdown veya aciklama uretme.",
    `Bugünün tarihi: ${new Date().toISOString().slice(0, 10)} (ISO 8601, gerçek). "yarın"/"bugün"/"gelecek hafta" gibi göreli tarihleri bu tarihe göre hesapla.`,
    'İzinli alanlar (fields içine yalnız bunlar): title (kısa görev başlığı, zorunlu), description (opsiyonel detay), dueDate (ISO 8601 tarih, yalnız kullanıcı açıkça bir tarih belirttiyse), priority (LOW|MEDIUM|HIGH). assigneeUserId fields içine ASLA yazma — kimlik uydurma.',
    'Görev bir kişiye atanıyorsa (ör. "bana", "kendim", "Ahmet\'e") bunu assigneeReference alanına ham metin olarak yaz: kullanıcı kendinden bahsediyorsa "SELF", başka biri belirtiliyorsa o kişinin adı (ör. "Ahmet"). Atama belirtilmediyse assigneeReference null. Gerçek kullanıcı kimliğini yalnız sistem çözer, sen asla üretme.',
    "Kullanicinin Turkce degerlerini aynen koru; eksik deger uydurma. Tarih belirtilmediyse dueDate alanini hic üretme.",
    "Kaydet/olustur/ekle ifadelerini ancak acikca söylendiyse explicitCommit=true yap. Fiil cümlenin sonunda da olabilir (ör. '... için görev oluştur.').",
    "Durum sorusu STATUS_QUERY, vazgec/iptal CANCEL, gorevle ilgisiz mesaj NOT_TASK_CREATE.",
    `Bekleyen bağlam: ${JSON.stringify(pendingContext)}.`,
    'Şema: {"kind":"CREATE_PLAN","intent":"OPEN|UPDATE_DRAFT|COMMIT|OPEN_UPDATE_COMMIT","fields":{},"explicitCommit":boolean,"assigneeReference":string|null}',
    'Diger semalar: {"kind":"STATUS_QUERY"}, {"kind":"CANCEL"}, {"kind":"NOT_TASK_CREATE"}, {"kind":"CLARIFICATION_REQUIRED","reason":"..."}.',
  ].join("\n");
}

const stripFence = (value: string) => value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

export async function resolveTaskCreatePlan(input: { utterance: string; pendingContext: TaskCreatePendingContext; generateText: GenerateTaskCreatePlanText }): Promise<TaskCreatePlan> {
  try {
    const raw = await input.generateText({ systemPrompt: buildTaskCreatePlanSystemPrompt(input.pendingContext), userMessage: input.utterance });
    const validated = validateTaskCreatePlan(JSON.parse(stripFence(raw)));
    if (validated) return validated;
  } catch { /* deterministic safe fallback below */ }
  return extractObviousTaskCreatePlan(input.utterance, input.pendingContext);
}

// Unanchored (no leading ^): Turkish is naturally verb-final, so the
// creation trigger routinely lands at the END of the utterance ("... için
// görev oluştur."), not the start. This same function backs BOTH the
// task-management-conversation-extension.ts ownership gate and this
// coordinator's own degraded-mode fallback — anchoring it to the start of
// the string caused the gate to veto (NOT_TASK_CREATE) the exact production
// regression utterance before the real LLM planner ever ran.
// \p{L}{0,3} tolerates Turkish suffixes glued directly onto "görev" (ör.
// "görevi", "görevini") — Turkish agglutination, not a typo; "Bir takip
// görevi oluştur." must trigger exactly like "görev oluştur.".
const TRIGGER = /(yeni\s+g[öo]rev\p{L}{0,3}(?:\s+olu[şs]tur)?|g[öo]rev\p{L}{0,3}\s+olu[şs]tur|hat[ıi]rlat(?:mam[ıi])?(?!\p{L}))\s*[:\-]?\s*/iu;
const CANCEL_WORDS = /^(vazge[çc]|iptal et|g[öo]revi iptal et)$/i;
const STATUS_WORDS = /^(g[öo]rev olu[şs]tu mu|kaydedildi mi|durum ne)[?.!]*$/i;
const COMMIT_WORDS = /\b(kaydet|olu[şs]tur|ekle)[.!]*$/i;
const JOINER_WORDS = /^(için|amacıyla)\s+|\s+(için|amacıyla)$/gi;

export function extractObviousTaskCreatePlan(utterance: string, pendingContext: TaskCreatePendingContext = null): TaskCreatePlan {
  const normalized = utterance.trim();
  const hasPending = Boolean(pendingContext);
  if (STATUS_WORDS.test(normalized)) return hasPending ? { kind: "STATUS_QUERY" } : { kind: "NOT_TASK_CREATE" };
  if (CANCEL_WORDS.test(normalized)) return hasPending ? { kind: "CANCEL" } : { kind: "NOT_TASK_CREATE" };

  const match = normalized.match(TRIGGER);
  if (!match && !hasPending) return { kind: "NOT_TASK_CREATE" };

  const rest = stripTrigger(normalized, match);
  const fields: TaskCreatePlanFields = {};
  const dueDate = extractDueDate(rest);
  const title = (dueDate.matchedText ? rest.replace(new RegExp(dueDate.matchedText, "i"), "") : rest).replace(/\s+/g, " ").trim().replace(/[.!]+$/, "").trim();
  if (title) fields.title = title;
  if (dueDate.iso) fields.dueDate = dueDate.iso;
  const explicitCommit = COMMIT_WORDS.test(normalized) || Boolean(match);
  const assigneeReference = SELF_REFERENCE_WORDS.test(normalized) ? "SELF" : null;

  if (!fields.title && !hasPending) return { kind: "NOT_TASK_CREATE" };
  const intent = explicitCommit && fields.title ? "OPEN_UPDATE_COMMIT" : match ? "OPEN" : "UPDATE_DRAFT";
  return { kind: "CREATE_PLAN", intent, fields, explicitCommit: explicitCommit && Boolean(fields.title), assigneeReference };
}

function stripTrigger(normalized: string, match: RegExpMatchArray | null): string {
  if (!match) return normalized;
  const start = match.index ?? 0;
  const withoutTrigger = normalized.slice(0, start) + normalized.slice(start + match[0].length);
  return withoutTrigger.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "").trim().replace(JOINER_WORDS, "").trim();
}

function extractDueDate(text: string): { iso?: string; matchedText?: string } {
  const now = new Date();
  const lower = text.toLocaleLowerCase("tr-TR");
  if (/\byar[ıi]na kadar\b|\byar[ıi]n\b/.test(lower)) {
    const match = lower.match(/\byar[ıi]na kadar\b|\byar[ıi]n\b/)!;
    const date = new Date(now); date.setDate(date.getDate() + 1);
    return { iso: date.toISOString().slice(0, 10), matchedText: match[0] };
  }
  if (/\bbug[üu]n\b/.test(lower)) {
    const match = lower.match(/\bbug[üu]n\b/)!;
    return { iso: now.toISOString().slice(0, 10), matchedText: match[0] };
  }
  return {};
}
