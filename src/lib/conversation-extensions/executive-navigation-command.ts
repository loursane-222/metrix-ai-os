import type { UniversalInputAuthorityCommand } from "@/lib/input-authority";

export const EXECUTIVE_NAVIGATION_COMMAND_EXPIRY_MS = 10_000;
export type ExecutiveNavigationCommandState = "CREATED" | "NAVIGATING" | "WAITING_FOR_SURFACE" | "CLAIMED" | "APPLYING" | "COMPLETED" | "FAILED" | "EXPIRED" | "SUPERSEDED";
export type ExecutiveNavigationSource = "written" | "voice";
export type ExecutiveNavigationCommand = Readonly<{
  commandId: string; correlationId: string; source: ExecutiveNavigationSource; route: string;
  expectedSurfaceAuthorityKey: string; expectedExecutiveTargetId?: string;
  batch?: readonly UniversalInputAuthorityCommand[]; finalFocusTargetId?: string;
  // Calendar-only navigation refinement — the requested Month/Week/Day view
  // and/or focus date ("YYYY-MM-DD"), already resolved deterministically
  // server-side (see business-navigation.ts). Undefined for every other
  // domain and for a plain "open Calendar" with no specific view/date.
  view?: "day" | "week" | "month"; focusDate?: string;
  createdAt: number; expiresAt: number; generation: number; state: ExecutiveNavigationCommandState;
}>;
export type ExecutiveNavigationCompletion = Readonly<{ status: "COMPLETED" | "FAILED" | "EXPIRED" | "SUPERSEDED"; changedExecutiveTargetIds: readonly string[] }>;
export type ExecutiveNavigationCommandInput = Readonly<Omit<ExecutiveNavigationCommand, "commandId" | "createdAt" | "expiresAt" | "generation" | "state"> & { commandId?: string; ttlMs?: number }>;

export function resolveNavigationAssistantContent(content: string, completion: ExecutiveNavigationCompletion | null): string {
  if (!completion || completion.status === "COMPLETED") return content;
  return "İlgili çalışma alanını bu turda açamadım. Tekrar dener misiniz?";
}

export function readExecutiveNavigationCommandInput(value: unknown): ExecutiveNavigationCommandInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.correlationId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(item.correlationId)) return null;
  if (item.source !== "written" && item.source !== "voice") return null;
  if (typeof item.route !== "string" || typeof item.expectedSurfaceAuthorityKey !== "string") return null;
  if (item.view !== undefined && !["day", "week", "month"].includes(String(item.view))) return null;
  if (item.focusDate !== undefined && (typeof item.focusDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.focusDate))) return null;
  return item as ExecutiveNavigationCommandInput;
}
