import type { CompanyProfileEditCommand, CompanyProfileEditCommandExecutionResult, CompanyProfileEditFieldName } from "./company-profile-edit-command-contract";
type ProfileRecord = Record<string, unknown>;
export type CompanyProfileEditDraft = Record<string, string>;
export type CompanyProfileEditSurfaceRuntimeAdapter = {
  getState(): { activeTab: string; draft: CompanyProfileEditDraft; profile: ProfileRecord };
  setField(field: CompanyProfileEditFieldName, value: string): void;
  commit(): Promise<{ ok: boolean; error?: string }>;
  discard(): void;
};
export async function applyCompanyProfileEditCommand(command: CompanyProfileEditCommand, runtime: CompanyProfileEditSurfaceRuntimeAdapter): Promise<CompanyProfileEditCommandExecutionResult> {
  switch (command.type) {
    case "set_field": runtime.setField(command.field, command.value); return { status: "EXECUTED", command, appliedField: command.field, appliedValue: command.value };
    case "clear_field": runtime.setField(command.field, ""); return { status: "EXECUTED", command, appliedField: command.field, appliedValue: "" };
    case "revert_field": { const profile = runtime.getState().profile; const raw = profile[command.field]; const value = Array.isArray(raw) ? raw.join(", ") : String(raw ?? ""); runtime.setField(command.field, value); return { status: "EXECUTED", command, appliedField: command.field, appliedValue: value }; }
    case "commit": { const result = await runtime.commit(); return result.ok ? { status: "EXECUTED", command, commitOutcome: "SAVED" } : { status: "EXECUTION_FAILED", error: result.error ?? "Kaydetme başarısız." }; }
    case "discard": runtime.discard(); return { status: "EXECUTED", command, revertedFields: Object.keys(runtime.getState().draft) };
  }
}
