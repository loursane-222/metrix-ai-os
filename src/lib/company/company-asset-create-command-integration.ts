import { isRecord } from "@/lib/api/validation";
import { resolveCompanyAssetCreateCommandRequest } from "./company-commands-client";
import { revalidateCompanyAssetCreateCommandResolution, type CompanyAssetCreateCommandExecutionResult } from "./company-asset-create-command-contract";
import { dispatchCompanyAssetCreateSurfaceCommand, getActiveCompanyAssetCreateSurfaceDescriptor } from "./company-asset-create-surface-command-channel";
export async function resolveAndDispatchCompanyAssetCreateSurfaceCommand(utterance: string): Promise<CompanyAssetCreateCommandExecutionResult | null> {
  const descriptor = getActiveCompanyAssetCreateSurfaceDescriptor();
  if (!descriptor) return null;
  const response = await resolveCompanyAssetCreateCommandRequest({ utterance });
  if (!response.ok) return { status: "EXECUTION_FAILED", error: response.error };
  const outcome = response.data.outcome;
  if (!isRecord(outcome) || outcome.kind !== "resolved") return { status: "VALIDATION_FAILED", reason: "Model çıktısı doğrulanamadı." };
  const resolution = revalidateCompanyAssetCreateCommandResolution(outcome.resolution);
  if (!resolution) return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı şemaya uymuyor." };
  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  return dispatchCompanyAssetCreateSurfaceCommand(descriptor.token, resolution.command);
}
