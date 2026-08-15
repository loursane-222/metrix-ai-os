import type { CompanySourceCreateCommand, CompanySourceCreateCommandExecutionResult, CompanySourceCreateFieldName } from "./company-source-create-command-contract";
export type CompanySourceCreateSurfaceRuntimeAdapter = { getState(): { activeTab: string; draft: Record<string, string> }; setField(field: CompanySourceCreateFieldName, value: string): void; commit(): Promise<{ ok: boolean; error?: string }> };
export async function applyCompanySourceCreateCommand(command: CompanySourceCreateCommand, runtime: CompanySourceCreateSurfaceRuntimeAdapter): Promise<CompanySourceCreateCommandExecutionResult> {
  switch (command.type) {
    case "set_field": runtime.setField(command.field, command.value); return { status: "EXECUTED", command, appliedField: command.field, appliedValue: command.value };
    case "commit": { const result = await runtime.commit(); return result.ok ? { status: "EXECUTED", command, commitOutcome: "SAVED" } : { status: "EXECUTION_FAILED", error: result.error ?? "Veri kaynağı oluşturma başarısız." }; }
  }
}
