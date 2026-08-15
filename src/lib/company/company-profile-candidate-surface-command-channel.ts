import { createEditSurfaceCommandChannel, type EditSurfaceDescriptor } from "@/lib/edit-command/edit-surface-command-channel";
import { applyCompanyProfileCandidateCommand, type CompanyProfileCandidateSurfaceRuntimeAdapter } from "./company-profile-candidate-command-apply";
import type { CompanyProfileCandidateCommand, CompanyProfileCandidateCommandExecutionResult } from "./company-profile-candidate-command-contract";
export type CompanyProfileCandidateSurfaceDescriptor = EditSurfaceDescriptor;
const channel = createEditSurfaceCommandChannel<CompanyProfileCandidateCommand, CompanyProfileCandidateCommandExecutionResult, CompanyProfileCandidateSurfaceRuntimeAdapter>({ domain: "company", tokenPrefix: "cpcandidate", applyCommand: applyCompanyProfileCandidateCommand, staleResult: () => ({ status: "STALE_SURFACE" }), failureResult: (error) => ({ status: "EXECUTION_FAILED", error }) });
export function registerCompanyProfileCandidateSurfaceTarget(params: { entityId: string; runtime: CompanyProfileCandidateSurfaceRuntimeAdapter }): string { return channel.register(params); }
export function unregisterCompanyProfileCandidateSurfaceTarget(token: string): void { channel.unregister(token); }
export function invalidateCompanyProfileCandidateSurfaceOwnership(): void { channel.invalidate(); }
export function getActiveCompanyProfileCandidateSurfaceDescriptor(): CompanyProfileCandidateSurfaceDescriptor | null { return channel.getDescriptor(); }
export function dispatchCompanyProfileCandidateSurfaceCommand(token: string, command: CompanyProfileCandidateCommand): Promise<CompanyProfileCandidateCommandExecutionResult> { return channel.dispatch(token, command); }
