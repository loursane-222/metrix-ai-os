import type { CompanyAssetCreateCommand, CompanyAssetCreateCommandExecutionResult, CompanyAssetCreateFieldName } from "./company-asset-create-command-contract";
export type CompanyAssetCreateSurfaceRuntimeAdapter = { getState(): { activeTab: string; draft: Record<string, string> }; setField(field: CompanyAssetCreateFieldName, value: string): void; commit(): Promise<{ ok: boolean; error?: string }> };
export async function applyCompanyAssetCreateCommand(command: CompanyAssetCreateCommand, runtime: CompanyAssetCreateSurfaceRuntimeAdapter): Promise<CompanyAssetCreateCommandExecutionResult> {
  switch (command.type) {
    case "set_field": runtime.setField(command.field, command.value); return { status: "EXECUTED", command, appliedField: command.field, appliedValue: command.value };
    case "commit": { const result = await runtime.commit(); return result.ok ? { status: "EXECUTED", command, commitOutcome: "SAVED" } : { status: "EXECUTION_FAILED", error: result.error ?? "Varlık oluşturma başarısız." }; }
  }
}
