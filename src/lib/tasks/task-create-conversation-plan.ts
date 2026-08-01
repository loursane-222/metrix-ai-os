import { isRecord } from "@/lib/api/validation";

export const TASK_CREATE_PLAN_FIELDS = ["title", "description", "dueDate", "priority", "assigneeUserId"] as const;
export type TaskCreatePlanField = (typeof TASK_CREATE_PLAN_FIELDS)[number];
export type TaskCreatePlanFields = Partial<Record<TaskCreatePlanField, string>>;

export type TaskCreatePlan =
  | { kind: "CREATE_PLAN"; intent: "OPEN" | "UPDATE_DRAFT" | "COMMIT" | "OPEN_UPDATE_COMMIT"; fields: TaskCreatePlanFields; explicitCommit: boolean }
  | { kind: "STATUS_QUERY" }
  | { kind: "CANCEL" }
  | { kind: "NOT_TASK_CREATE" }
  | { kind: "CLARIFICATION_REQUIRED"; reason: string };

export function validateTaskCreatePlan(raw: unknown): TaskCreatePlan | null {
  if (!isRecord(raw) || typeof raw.kind !== "string") return null;
  if (["STATUS_QUERY", "CANCEL", "NOT_TASK_CREATE"].includes(raw.kind)) {
    return hasExactKeys(raw, ["kind"]) ? ({ kind: raw.kind } as TaskCreatePlan) : null;
  }
  if (raw.kind === "CLARIFICATION_REQUIRED") {
    return hasExactKeys(raw, ["kind", "reason"]) && typeof raw.reason === "string" && raw.reason.trim()
      ? { kind: raw.kind, reason: raw.reason.trim() }
      : null;
  }
  if (raw.kind !== "CREATE_PLAN" || !isRecord(raw.fields) || typeof raw.explicitCommit !== "boolean") return null;
  if (!hasExactKeys(raw, ["kind", "intent", "fields", "explicitCommit"])) return null;
  const intents = ["OPEN", "UPDATE_DRAFT", "COMMIT", "OPEN_UPDATE_COMMIT"] as const;
  if (typeof raw.intent !== "string" || !(intents as readonly string[]).includes(raw.intent)) return null;
  if (raw.explicitCommit !== (raw.intent === "COMMIT" || raw.intent === "OPEN_UPDATE_COMMIT")) return null;
  const fields: TaskCreatePlanFields = {};
  for (const [key, value] of Object.entries(raw.fields)) {
    if (!(TASK_CREATE_PLAN_FIELDS as readonly string[]).includes(key) || typeof value !== "string" || !value.trim() || value.length > 500) return null;
    fields[key as TaskCreatePlanField] = value.trim();
  }
  return { kind: "CREATE_PLAN", intent: raw.intent as Extract<TaskCreatePlan, { kind: "CREATE_PLAN" }>["intent"], fields, explicitCommit: raw.explicitCommit };
}

function hasExactKeys(raw: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(raw).sort();
  const sortedExpected = [...expected].sort();
  return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}
