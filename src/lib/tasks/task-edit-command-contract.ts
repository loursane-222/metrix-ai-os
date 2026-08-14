import { isRecord } from "@/lib/api/validation";

export type TaskEditCommand = { type: "complete" };
export type TaskEditCommandResolution = { kind: "executable"; command: TaskEditCommand } | { kind: "unsupported" } | { kind: "clarification_required"; message: string };
export type TaskEditCommandExecutionResult = { status: "EXECUTED"; command: TaskEditCommand } | { status: "UNSUPPORTED" } | { status: "CLARIFICATION_REQUIRED"; message: string } | { status: "NO_ACTIVE_SURFACE" } | { status: "STALE_SURFACE" } | { status: "VALIDATION_FAILED"; reason: string } | { status: "EXECUTION_FAILED"; error: string };

function requiredText(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

export function validateTaskEditCommandResolution(raw: unknown): TaskEditCommandResolution | null {
  if (!isRecord(raw)) return null;
  if (raw.result === "unsupported") return { kind: "unsupported" };
  if (raw.result === "clarification_required") { const message = requiredText(raw.message); return message ? { kind: "clarification_required", message } : null; }
  if (raw.result !== "executable" || raw.action !== "complete") return null;
  return { kind: "executable", command: { type: "complete" } };
}

export function revalidateTaskEditCommandResolution(raw: unknown): TaskEditCommandResolution | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "unsupported") return { kind: "unsupported" };
  if (raw.kind === "clarification_required") { const message = requiredText(raw.message); return message ? { kind: "clarification_required", message } : null; }
  if (raw.kind !== "executable" || !isRecord(raw.command)) return null;
  return validateTaskEditCommandResolution({ result: "executable", action: raw.command.type });
}
