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
export type ExecutiveNavigationCompletion = Readonly<{ status: "COMPLETED" | "FAILED" | "EXPIRED" | "SUPERSEDED"; changedExecutiveTargetIds: readonly string[]; message?: string }>;
export type ExecutiveNavigationCommandInput = Readonly<Omit<ExecutiveNavigationCommand, "commandId" | "createdAt" | "expiresAt" | "generation" | "state"> & { commandId?: string; ttlMs?: number }>;
