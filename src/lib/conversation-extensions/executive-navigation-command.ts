import type { UniversalInputAuthorityCommand } from "@/lib/input-authority";

export const EXECUTIVE_NAVIGATION_COMMAND_EXPIRY_MS = 10_000;
export type ExecutiveNavigationCommandState = "CREATED" | "NAVIGATING" | "WAITING_FOR_SURFACE" | "CLAIMED" | "APPLYING" | "COMPLETED" | "FAILED" | "EXPIRED" | "SUPERSEDED";
export type ExecutiveNavigationSource = "written" | "voice";
export type ExecutiveNavigationCommand = Readonly<{
  commandId: string; correlationId: string; source: ExecutiveNavigationSource; route: string;
  expectedSurfaceAuthorityKey: string; expectedExecutiveTargetId?: string;
  batch?: readonly UniversalInputAuthorityCommand[]; finalFocusTargetId?: string;
  createdAt: number; expiresAt: number; generation: number; state: ExecutiveNavigationCommandState;
}>;
export type ExecutiveNavigationCompletion = Readonly<{ status: "COMPLETED" | "FAILED" | "EXPIRED" | "SUPERSEDED"; changedExecutiveTargetIds: readonly string[] }>;
export type ExecutiveNavigationCommandInput = Readonly<Omit<ExecutiveNavigationCommand, "commandId" | "createdAt" | "expiresAt" | "generation" | "state"> & { commandId?: string; ttlMs?: number }>;

export function readExecutiveNavigationCommandInput(value: unknown): ExecutiveNavigationCommandInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.correlationId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(item.correlationId)) return null;
  if (item.source !== "written" && item.source !== "voice") return null;
  if (typeof item.route !== "string" || typeof item.expectedSurfaceAuthorityKey !== "string") return null;
  return item as ExecutiveNavigationCommandInput;
}
