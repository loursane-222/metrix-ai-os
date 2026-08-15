import { isRecord } from "@/lib/api/validation";
import { resolveCompanySourceCreateCommandRequest } from "./company-commands-client";
import { revalidateCompanySourceCreateCommandResolution, type CompanySourceCreateCommandExecutionResult } from "./company-source-create-command-contract";
import { dispatchCompanySourceCreateSurfaceCommand, getActiveCompanySourceCreateSurfaceDescriptor } from "./company-source-create-surface-command-channel";
export async function resolveAndDispatchCompanySourceCreateSurfaceCommand(utterance: string): Promise<CompanySourceCreateCommandExecutionResult | null> {
  const descriptor = getActiveCompanySourceCreateSurfaceDescriptor();
  if (!descriptor) return null;
  const response = await resolveCompanySourceCreateCommandRequest({ utterance });
  if (!response.ok) return { status: "EXECUTION_FAILED", error: response.error };
  const outcome = response.data.outcome;
  if (!isRecord(outcome) || outcome.kind !== "resolved") return { status: "VALIDATION_FAILED", reason: "Model çıktısı doğrulanamadı." };
  const resolution = revalidateCompanySourceCreateCommandResolution(outcome.resolution);
  if (!resolution) return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı şemaya uymuyor." };
  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  return dispatchCompanySourceCreateSurfaceCommand(descriptor.token, resolution.command);
}
