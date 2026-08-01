import type { TaskCreateCommand, TaskCreateCommandOutcome, TaskCreateSurfaceRuntime } from "./task-create-surface-runtime";
let active: { token: string; runtime: Pick<TaskCreateSurfaceRuntime, "getState" | "execute"> } | null = null;
let sequence = 0;
const mountListeners = new Set<(descriptor: ReturnType<typeof getActiveTaskCreateSurfaceDescriptor>) => void>();
export function registerTaskCreateSurface(runtime: Pick<TaskCreateSurfaceRuntime, "getState" | "execute">) { const token = `tcsc_${++sequence}`; active = { token, runtime }; const descriptor = getActiveTaskCreateSurfaceDescriptor(); for (const listener of mountListeners) listener(descriptor); return token; }
export function unregisterTaskCreateSurface(token: string) { if (active?.token === token) active = null; }
export function getActiveTaskCreateSurfaceDescriptor() { return active ? { token: active.token, surface: "task.create" as const } : null; }
export async function dispatchTaskCreateCommand(token: string, command: TaskCreateCommand): Promise<TaskCreateCommandOutcome> { if (!active || active.token !== token) return { status: "REJECTED", message: "Create surface is no longer active." }; return active.runtime.execute(command); }
export function resetTaskCreateSurfaceForTests() { active = null; sequence = 0; }
