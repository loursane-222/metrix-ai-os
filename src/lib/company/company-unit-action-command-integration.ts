import { isRecord } from "@/lib/api/validation";
import { resolveCompanyUnitActionCommandRequest } from "./company-commands-client";
import { revalidateCompanyUnitActionCommandResolution, type CompanyUnitActionCommandExecutionResult } from "./company-unit-action-command-contract";
import { dispatchCompanyUnitActionSurfaceCommand, getCompanyUnitActionSurfaceDescriptors } from "./company-unit-action-surface-command-channel";
export async function resolveAndDispatchCompanyUnitActionSurfaceCommand(utterance: string): Promise<CompanyUnitActionCommandExecutionResult | null> {
  const descriptors = getCompanyUnitActionSurfaceDescriptors();
  if (!descriptors.length) return null;
  const response = await resolveCompanyUnitActionCommandRequest({ utterance });
  if (!response.ok) return { status: "EXECUTION_FAILED", error: response.error };
  const outcome = response.data.outcome;
  if (!isRecord(outcome) || outcome.kind !== "resolved") return { status: "VALIDATION_FAILED", reason: "Model çıktısı doğrulanamadı." };
  const resolution = revalidateCompanyUnitActionCommandResolution(outcome.resolution);
  if (!resolution) return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı şemaya uymuyor." };
  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  if (!descriptors.some((d) => d.entityId === resolution.command.unitId)) return { status: "TARGET_NOT_FOUND" };
  return dispatchCompanyUnitActionSurfaceCommand(resolution.command.unitId, resolution.command);
}
