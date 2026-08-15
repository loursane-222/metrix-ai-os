import { isRecord } from "@/lib/api/validation";
import { resolveCompanyProfileEditCommandRequest } from "./company-commands-client";
import { revalidateCompanyProfileEditCommandResolution, type CompanyProfileEditCommandExecutionResult } from "./company-profile-edit-command-contract";
import { dispatchCompanyProfileEditSurfaceCommand, getActiveCompanyProfileEditSurfaceDescriptor } from "./company-profile-edit-surface-command-channel";
export async function resolveAndDispatchCompanyProfileEditSurfaceCommand(utterance: string): Promise<CompanyProfileEditCommandExecutionResult | null> {
  const descriptor = getActiveCompanyProfileEditSurfaceDescriptor();
  if (!descriptor) return null;
  const response = await resolveCompanyProfileEditCommandRequest({ utterance, activeTab: descriptor.activeTab });
  if (!response.ok) return { status: "EXECUTION_FAILED", error: response.error };
  const outcome = response.data.outcome;
  if (!isRecord(outcome) || outcome.kind !== "resolved") return { status: "VALIDATION_FAILED", reason: "Model çıktısı doğrulanamadı." };
  const resolution = revalidateCompanyProfileEditCommandResolution(outcome.resolution);
  if (!resolution) return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı şemaya uymuyor." };
  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  return dispatchCompanyProfileEditSurfaceCommand(descriptor.token, resolution.command);
}
export function describeCompanyProfileEditCommandExecutionResult(result: CompanyProfileEditCommandExecutionResult): string | null {
  if (result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return null;
  if (result.status === "CLARIFICATION_REQUIRED") return result.message;
  if (result.status === "STALE_SURFACE") return "Şirket profil ekranı artık aktif değil.";
  if (result.status === "VALIDATION_FAILED") return "Komutu anlayamadım, tekrar dener misin?";
  if (result.status === "EXECUTION_FAILED") return `İşlem başarısız: ${result.error}`;
  if (result.command.type === "commit") return "Şirket profili kaydedildi.";
  if (result.command.type === "discard") return "Değişiklikler geri alındı.";
  return `${result.appliedField} güncellendi.`;
}
