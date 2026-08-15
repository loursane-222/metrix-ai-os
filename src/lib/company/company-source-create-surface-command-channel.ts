import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";
import { applyCompanySourceCreateCommand, type CompanySourceCreateSurfaceRuntimeAdapter } from "./company-source-create-command-apply";
import type { CompanySourceCreateCommand, CompanySourceCreateCommandExecutionResult } from "./company-source-create-command-contract";
export type CompanySourceCreateSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<CompanySourceCreateCommand, CompanySourceCreateCommandExecutionResult, CompanySourceCreateSurfaceRuntimeAdapter>({ domain: "company", tokenPrefix: "csource", applyCommand: applyCompanySourceCreateCommand, staleResult: () => ({ status: "STALE_SURFACE" }), failureResult: (error) => ({ status: "EXECUTION_FAILED", error }) });
export function registerCompanySourceCreateSurfaceTarget(params: { entityId: string; runtime: CompanySourceCreateSurfaceRuntimeAdapter }): string { return channel.register(params); }
export function unregisterCompanySourceCreateSurfaceTarget(token: string): void { channel.unregister(token); }
export function invalidateCompanySourceCreateSurfaceOwnership(): void { channel.invalidate(); }
export function getActiveCompanySourceCreateSurfaceDescriptor(): CompanySourceCreateSurfaceDescriptor | null { return channel.getDescriptor(); }
export function dispatchCompanySourceCreateSurfaceCommand(token: string, command: CompanySourceCreateCommand): Promise<CompanySourceCreateCommandExecutionResult> { return channel.dispatch(token, command); }
