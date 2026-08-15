import { isRecord } from "@/lib/api/validation";
import { resolveCompanyGoalCreateCommandRequest } from "./company-commands-client";
import { revalidateCompanyGoalCreateCommandResolution, type CompanyGoalCreateCommandExecutionResult } from "./company-goal-create-command-contract";
import { dispatchCompanyGoalCreateSurfaceCommand, getActiveCompanyGoalCreateSurfaceDescriptor } from "./company-goal-create-surface-command-channel";
export async function resolveAndDispatchCompanyGoalCreateSurfaceCommand(utterance: string): Promise<CompanyGoalCreateCommandExecutionResult | null> {
  const descriptor = getActiveCompanyGoalCreateSurfaceDescriptor();
  if (!descriptor) return null;
  const response = await resolveCompanyGoalCreateCommandRequest({ utterance });
  if (!response.ok) return { status: "EXECUTION_FAILED", error: response.error };
  const outcome = response.data.outcome;
  if (!isRecord(outcome) || outcome.kind !== "resolved") return { status: "VALIDATION_FAILED", reason: "Model çıktısı doğrulanamadı." };
  const resolution = revalidateCompanyGoalCreateCommandResolution(outcome.resolution);
  if (!resolution) return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı şemaya uymuyor." };
  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  return dispatchCompanyGoalCreateSurfaceCommand(descriptor.token, resolution.command);
}
