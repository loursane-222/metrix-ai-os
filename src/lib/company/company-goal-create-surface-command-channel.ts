import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";
import { applyCompanyGoalCreateCommand, type CompanyGoalCreateSurfaceRuntimeAdapter } from "./company-goal-create-command-apply";
import type { CompanyGoalCreateCommand, CompanyGoalCreateCommandExecutionResult } from "./company-goal-create-command-contract";
export type CompanyGoalCreateSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<CompanyGoalCreateCommand, CompanyGoalCreateCommandExecutionResult, CompanyGoalCreateSurfaceRuntimeAdapter>({ domain: "company", tokenPrefix: "cgoal", applyCommand: applyCompanyGoalCreateCommand, staleResult: () => ({ status: "STALE_SURFACE" }), failureResult: (error) => ({ status: "EXECUTION_FAILED", error }) });
export function registerCompanyGoalCreateSurfaceTarget(params: { entityId: string; runtime: CompanyGoalCreateSurfaceRuntimeAdapter }): string { return channel.register(params); }
export function unregisterCompanyGoalCreateSurfaceTarget(token: string): void { channel.unregister(token); }
export function invalidateCompanyGoalCreateSurfaceOwnership(): void { channel.invalidate(); }
export function getActiveCompanyGoalCreateSurfaceDescriptor(): CompanyGoalCreateSurfaceDescriptor | null { return channel.getDescriptor(); }
export function dispatchCompanyGoalCreateSurfaceCommand(token: string, command: CompanyGoalCreateCommand): Promise<CompanyGoalCreateCommandExecutionResult> { return channel.dispatch(token, command); }
