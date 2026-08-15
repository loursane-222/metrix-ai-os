import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";
import { applyCompanyUnitFormCommand, type CompanyUnitFormSurfaceRuntimeAdapter } from "./company-unit-form-command-apply";
import type { CompanyUnitFormCommand, CompanyUnitFormCommandExecutionResult } from "./company-unit-form-command-contract";
export type CompanyUnitFormSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<CompanyUnitFormCommand, CompanyUnitFormCommandExecutionResult, CompanyUnitFormSurfaceRuntimeAdapter>({ domain: "company", tokenPrefix: "cuform", applyCommand: applyCompanyUnitFormCommand, staleResult: () => ({ status: "STALE_SURFACE" }), failureResult: (error) => ({ status: "EXECUTION_FAILED", error }) });
export function registerCompanyUnitFormSurfaceTarget(params: { entityId: string; runtime: CompanyUnitFormSurfaceRuntimeAdapter }): string { return channel.register(params); }
export function unregisterCompanyUnitFormSurfaceTarget(token: string): void { channel.unregister(token); }
export function invalidateCompanyUnitFormSurfaceOwnership(): void { channel.invalidate(); }
export function getActiveCompanyUnitFormSurfaceDescriptor(): CompanyUnitFormSurfaceDescriptor | null { return channel.getDescriptor(); }
export function dispatchCompanyUnitFormSurfaceCommand(token: string, command: CompanyUnitFormCommand): Promise<CompanyUnitFormCommandExecutionResult> { return channel.dispatch(token, command); }
