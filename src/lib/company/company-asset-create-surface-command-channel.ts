import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";
import { applyCompanyAssetCreateCommand, type CompanyAssetCreateSurfaceRuntimeAdapter } from "./company-asset-create-command-apply";
import type { CompanyAssetCreateCommand, CompanyAssetCreateCommandExecutionResult } from "./company-asset-create-command-contract";
export type CompanyAssetCreateSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<CompanyAssetCreateCommand, CompanyAssetCreateCommandExecutionResult, CompanyAssetCreateSurfaceRuntimeAdapter>({ domain: "company", tokenPrefix: "casset", applyCommand: applyCompanyAssetCreateCommand, staleResult: () => ({ status: "STALE_SURFACE" }), failureResult: (error) => ({ status: "EXECUTION_FAILED", error }) });
export function registerCompanyAssetCreateSurfaceTarget(params: { entityId: string; runtime: CompanyAssetCreateSurfaceRuntimeAdapter }): string { return channel.register(params); }
export function unregisterCompanyAssetCreateSurfaceTarget(token: string): void { channel.unregister(token); }
export function invalidateCompanyAssetCreateSurfaceOwnership(): void { channel.invalidate(); }
export function getActiveCompanyAssetCreateSurfaceDescriptor(): CompanyAssetCreateSurfaceDescriptor | null { return channel.getDescriptor(); }
export function dispatchCompanyAssetCreateSurfaceCommand(token: string, command: CompanyAssetCreateCommand): Promise<CompanyAssetCreateCommandExecutionResult> { return channel.dispatch(token, command); }
