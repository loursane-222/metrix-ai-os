import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";
import type { TaskEditCommand, TaskEditCommandExecutionResult } from "./task-edit-command-contract";

export type TaskEditSurfaceRuntimeAdapter = { getState(): { activeTab: "actions" }; applyCommand(command: TaskEditCommand): Promise<TaskEditCommandExecutionResult> };
export type TaskEditSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<TaskEditCommand, TaskEditCommandExecutionResult, TaskEditSurfaceRuntimeAdapter>({ domain: "tasks", tokenPrefix: "tskesc", applyCommand: (command, runtime) => runtime.applyCommand(command), staleResult: () => ({ status: "STALE_SURFACE" }), failureResult: (error) => ({ status: "EXECUTION_FAILED", error }) });
export function registerTaskEditSurfaceTarget(params: { entityId: string; runtime: TaskEditSurfaceRuntimeAdapter }): string { return channel.register(params); }
export function unregisterTaskEditSurfaceTarget(token: string): void { channel.unregister(token); }
export function invalidateTaskEditSurfaceOwnership(): void { channel.invalidate(); }
export function getActiveTaskEditSurfaceDescriptor(): TaskEditSurfaceDescriptor | null { return channel.getDescriptor(); }
export function resetTaskEditSurfaceCommandChannelForTests(): void { channel.resetForTests(); }
export function dispatchTaskEditSurfaceCommand(token: string, command: TaskEditCommand): Promise<TaskEditCommandExecutionResult> { return channel.dispatch(token, command); }
