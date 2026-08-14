export type CalendarConflictRuntime = { getState(): { pendingConflict: unknown }; setPendingConflict(conflict: unknown): void; confirmConflict(): Promise<void>; discardConflict(): void };
let active: { token: string; runtime: CalendarConflictRuntime } | null = null;
let counter = 0;
export function registerCalendarConflictSurfaceTarget(runtime: CalendarConflictRuntime): string { const token = `calendar_${++counter}`; active = { token, runtime }; return token; }
export function unregisterCalendarConflictSurfaceTarget(token: string): void { if (active?.token === token) active = null; }
export function invalidateCalendarConflictSurfaceOwnership(): void { active = null; }
export function getActiveCalendarConflictSurface(): { token: string; runtime: CalendarConflictRuntime } | null { return active; }
export function setActiveCalendarConflict(conflict: unknown): boolean { if (!active) return false; active.runtime.setPendingConflict(conflict); return true; }
export async function dispatchCalendarConflictCommand(token: string, command: "confirm_conflict" | "discard_conflict"): Promise<boolean> { if (!active || active.token !== token || !active.runtime.getState().pendingConflict) return false; if (command === "confirm_conflict") await active.runtime.confirmConflict(); else active.runtime.discardConflict(); return true; }
