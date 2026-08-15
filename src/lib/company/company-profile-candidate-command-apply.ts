import type { CompanyProfileCandidateCommand, CompanyProfileCandidateCommandExecutionResult, CompanyProfileCandidateFieldName } from "./company-profile-candidate-command-contract";
type ProfileRecord = Record<string, unknown>;
export type CompanyProfileCandidateDraft = Record<string, string>;
export type CompanyProfileCandidateSurfaceRuntimeAdapter = {
  getState(): { activeTab: string; draft: CompanyProfileCandidateDraft; profile: ProfileRecord };
  setField(field: CompanyProfileCandidateFieldName, value: string): void;
  commit(): Promise<{ ok: boolean; error?: string }>;
  discard(): void;
};
export async function applyCompanyProfileCandidateCommand(command: CompanyProfileCandidateCommand, runtime: CompanyProfileCandidateSurfaceRuntimeAdapter): Promise<CompanyProfileCandidateCommandExecutionResult> {
  switch (command.type) {
    case "set_field": runtime.setField(command.field, command.value); return { status: "EXECUTED", command, appliedField: command.field, appliedValue: command.value };
    case "clear_field": runtime.setField(command.field, ""); return { status: "EXECUTED", command, appliedField: command.field, appliedValue: "" };
    case "revert_field": { const profile = runtime.getState().profile; const raw = profile[command.field]; const value = Array.isArray(raw) ? raw.join(", ") : String(raw ?? ""); runtime.setField(command.field, value); return { status: "EXECUTED", command, appliedField: command.field, appliedValue: value }; }
    case "commit": { const result = await runtime.commit(); return result.ok ? { status: "EXECUTED", command, commitOutcome: "PENDING_APPROVAL" } : { status: "EXECUTION_FAILED", error: result.error ?? "Candidate oluşturulamadı." }; }
    case "discard": runtime.discard(); return { status: "EXECUTED", command, revertedFields: Object.keys(runtime.getState().draft) };
  }
}
