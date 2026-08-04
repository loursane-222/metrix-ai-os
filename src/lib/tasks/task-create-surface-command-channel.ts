import type { TaskCreateCommand, TaskCreateCommandOutcome, TaskCreateSurfaceRuntime } from "./task-create-surface-runtime";
// operationId mirrors customer-create-surface-command-channel.ts exactly:
// the same canonical operation identity minted by TaskCreateConversationCoordinator's
// store, carried as the navigation command's correlationId, and required to
// match at commit dispatch so mutation is bound to the operation that opened
// this Surface.
let active: { token: string; operationId: string | null; runtime: Pick<TaskCreateSurfaceRuntime, "getState" | "execute"> } | null = null;
let sequence = 0;
const mountListeners = new Set<(descriptor: ReturnType<typeof getActiveTaskCreateSurfaceDescriptor>) => void>();
export function registerTaskCreateSurface(runtime: Pick<TaskCreateSurfaceRuntime, "getState" | "execute">, operationId: string | null = null) { const token = `tcsc_${++sequence}`; active = { token, operationId, runtime }; const descriptor = getActiveTaskCreateSurfaceDescriptor(); for (const listener of mountListeners) listener(descriptor); return token; }
export function unregisterTaskCreateSurface(token: string) { if (active?.token === token) active = null; }
export function getActiveTaskCreateSurfaceDescriptor() { return active ? { token: active.token, operationId: active.operationId, surface: "task.create" as const } : null; }
export async function dispatchTaskCreateCommand(token: string, command: TaskCreateCommand, operationId: string | null = null): Promise<TaskCreateCommandOutcome> {
  if (!active || active.token !== token) return { status: "REJECTED", message: "Create surface is no longer active." };
  if (operationId !== null && active.operationId !== null && active.operationId !== operationId) return { status: "REJECTED", message: "Create surface belongs to a different operation." };
  return active.runtime.execute(command);
}
export function resetTaskCreateSurfaceForTests() { active = null; sequence = 0; }
