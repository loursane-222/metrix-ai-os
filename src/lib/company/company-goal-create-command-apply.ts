import type { CompanyGoalCreateCommand, CompanyGoalCreateCommandExecutionResult, CompanyGoalCreateFieldName } from "./company-goal-create-command-contract";
export type CompanyGoalCreateSurfaceRuntimeAdapter = { getState(): { activeTab: string; draft: Record<string, string> }; setField(field: CompanyGoalCreateFieldName, value: string): void; commit(): Promise<{ ok: boolean; error?: string }> };
export async function applyCompanyGoalCreateCommand(command: CompanyGoalCreateCommand, runtime: CompanyGoalCreateSurfaceRuntimeAdapter): Promise<CompanyGoalCreateCommandExecutionResult> {
  switch (command.type) {
    case "set_field": runtime.setField(command.field, command.value); return { status: "EXECUTED", command, appliedField: command.field, appliedValue: command.value };
    case "commit": { const result = await runtime.commit(); return result.ok ? { status: "EXECUTED", command, commitOutcome: "SAVED" } : { status: "EXECUTION_FAILED", error: result.error ?? "Hedef oluşturma başarısız." }; }
  }
}
