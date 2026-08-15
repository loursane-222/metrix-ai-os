import { isRecord } from "@/lib/api/validation";
import { resolveCompanyUnitFormCommandRequest } from "./company-commands-client";
import { revalidateCompanyUnitFormCommandResolution, type CompanyUnitFormCommandExecutionResult } from "./company-unit-form-command-contract";
import { dispatchCompanyUnitFormSurfaceCommand, getActiveCompanyUnitFormSurfaceDescriptor } from "./company-unit-form-surface-command-channel";
export async function resolveAndDispatchCompanyUnitFormSurfaceCommand(utterance: string): Promise<CompanyUnitFormCommandExecutionResult | null> {
  const descriptor = getActiveCompanyUnitFormSurfaceDescriptor();
  if (!descriptor) return null;
  const response = await resolveCompanyUnitFormCommandRequest({ utterance });
  if (!response.ok) return { status: "EXECUTION_FAILED", error: response.error };
  const outcome = response.data.outcome;
  if (!isRecord(outcome) || outcome.kind !== "resolved") return { status: "VALIDATION_FAILED", reason: "Model çıktısı doğrulanamadı." };
  const resolution = revalidateCompanyUnitFormCommandResolution(outcome.resolution);
  if (!resolution) return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı şemaya uymuyor." };
  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  return dispatchCompanyUnitFormSurfaceCommand(descriptor.token, resolution.command);
}
