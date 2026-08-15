import type { CompanyUnitFormCommand, CompanyUnitFormCommandExecutionResult, CompanyUnitFormFieldName } from "./company-unit-form-command-contract";
type UnitRecord = { id: string; name: string; unitType: string; isPrimary: boolean; code?: string; country?: string; city?: string; district?: string; postalCode?: string; addressLine1?: string; addressLine2?: string };
export type CompanyUnitFormRuntimeState = { activeTab: string; draft: Record<string, string>; units: UnitRecord[] };
export type CompanyUnitFormSurfaceRuntimeAdapter = {
  getState(): CompanyUnitFormRuntimeState;
  setField(field: CompanyUnitFormFieldName, value: string): void;
  loadUnit(unit: UnitRecord): void;
  commit(): Promise<{ ok: boolean; error?: string }>;
  discard(): void;
};
export async function applyCompanyUnitFormCommand(command: CompanyUnitFormCommand, runtime: CompanyUnitFormSurfaceRuntimeAdapter): Promise<CompanyUnitFormCommandExecutionResult> {
  switch (command.type) {
    case "set_field":
      runtime.setField(command.field, command.value);
      return { status: "EXECUTED", command, appliedField: command.field, appliedValue: command.value };
    case "load_unit": {
      const unit = runtime.getState().units.find((u) => u.id === command.unitId);
      if (!unit) return { status: "TARGET_NOT_FOUND" };
      runtime.loadUnit(unit);
      return { status: "EXECUTED", command };
    }
    case "commit": {
      const result = await runtime.commit();
      return result.ok ? { status: "EXECUTED", command, commitOutcome: "SAVED" } : { status: "EXECUTION_FAILED", error: result.error ?? "Kaydetme başarısız." };
    }
    case "discard":
      runtime.discard();
      return { status: "EXECUTED", command };
  }
}
