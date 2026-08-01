import { validateTaskCreatePlan, type TaskCreatePlan, type TaskCreatePlanFields } from "./task-create-conversation-plan";

export type TaskCreatePendingContext = { lifecycle: "OPENING" | "COLLECTING" | "READY"; fields: TaskCreatePlanFields } | null;

export type GenerateTaskCreatePlanText = (input: { systemPrompt: string; userMessage: string }) => Promise<string>;

export function buildTaskCreatePlanSystemPrompt(pendingContext: TaskCreatePendingContext): string {
  return [
    "Sen görev oluşturma konuşmasını strict JSON plana çeviren capture-source planner'sın.",
    "JSON disinda metin, markdown veya aciklama uretme.",
    'İzinli alanlar: title (kısa görev başlığı, zorunlu), description (opsiyonel detay), dueDate (ISO 8601 tarih, yalnız kullanıcı açıkça bir tarih belirttiyse), priority (LOW|MEDIUM|HIGH), assigneeUserId (yalnız açık bir kullanıcı kimliği belirtildiyse).',
    "Kullanicinin Turkce degerlerini aynen koru; eksik deger uydurma. Tarih belirtilmediyse dueDate alanini hic üretme.",
    "Kaydet/olustur/ekle ifadelerini ancak acikca söylendiyse explicitCommit=true yap.",
    "Durum sorusu STATUS_QUERY, vazgec/iptal CANCEL, gorevle ilgisiz mesaj NOT_TASK_CREATE.",
    `Bekleyen bağlam: ${JSON.stringify(pendingContext)}.`,
    'Şema: {"kind":"CREATE_PLAN","intent":"OPEN|UPDATE_DRAFT|COMMIT|OPEN_UPDATE_COMMIT","fields":{},"explicitCommit":boolean}',
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

const TRIGGER = /^(yeni\s+g[öo]rev(?:\s+olu[şs]tur)?|g[öo]rev\s+olu[şs]tur|hat[ıi]rlat(?:mam[ıi])?)\s*[:\-]?\s*/i;
const CANCEL_WORDS = /^(vazge[çc]|iptal et|g[öo]revi iptal et)$/i;
const STATUS_WORDS = /^(g[öo]rev olu[şs]tu mu|kaydedildi mi|durum ne)[?.!]*$/i;
const COMMIT_WORDS = /\b(kaydet|olu[şs]tur|ekle)[.!]*$/i;

export function extractObviousTaskCreatePlan(utterance: string, pendingContext: TaskCreatePendingContext = null): TaskCreatePlan {
  const normalized = utterance.trim();
  const hasPending = Boolean(pendingContext);
  if (STATUS_WORDS.test(normalized)) return hasPending ? { kind: "STATUS_QUERY" } : { kind: "NOT_TASK_CREATE" };
  if (CANCEL_WORDS.test(normalized)) return hasPending ? { kind: "CANCEL" } : { kind: "NOT_TASK_CREATE" };

  const match = normalized.match(TRIGGER);
  if (!match && !hasPending) return { kind: "NOT_TASK_CREATE" };

  const rest = match ? normalized.slice(match[0].length).trim() : normalized;
  const fields: TaskCreatePlanFields = {};
  const dueDate = extractDueDate(rest);
  const title = rest.replace(dueDate.matchedText ?? "", "").trim().replace(/[.!]+$/, "");
  if (title) fields.title = title;
  if (dueDate.iso) fields.dueDate = dueDate.iso;
  const explicitCommit = COMMIT_WORDS.test(normalized) || Boolean(match);

  if (!fields.title && !hasPending) return { kind: "NOT_TASK_CREATE" };
  const intent = explicitCommit && fields.title ? "OPEN_UPDATE_COMMIT" : match ? "OPEN" : "UPDATE_DRAFT";
  return { kind: "CREATE_PLAN", intent, fields, explicitCommit: explicitCommit && Boolean(fields.title) };
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
