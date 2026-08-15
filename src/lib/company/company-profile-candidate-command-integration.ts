import { isRecord } from "@/lib/api/validation";
import { resolveCompanyProfileCandidateCommandRequest } from "./company-commands-client";
import { revalidateCompanyProfileCandidateCommandResolution, type CompanyProfileCandidateCommandExecutionResult } from "./company-profile-candidate-command-contract";
import { dispatchCompanyProfileCandidateSurfaceCommand, getActiveCompanyProfileCandidateSurfaceDescriptor } from "./company-profile-candidate-surface-command-channel";
export async function resolveAndDispatchCompanyProfileCandidateSurfaceCommand(utterance: string): Promise<CompanyProfileCandidateCommandExecutionResult | null> {
  const descriptor = getActiveCompanyProfileCandidateSurfaceDescriptor();
  if (!descriptor) return null;
  const response = await resolveCompanyProfileCandidateCommandRequest({ utterance, activeTab: descriptor.activeTab });
  if (!response.ok) return { status: "EXECUTION_FAILED", error: response.error };
  const outcome = response.data.outcome;
  if (!isRecord(outcome) || outcome.kind !== "resolved") return { status: "VALIDATION_FAILED", reason: "Model çıktısı doğrulanamadı." };
  const resolution = revalidateCompanyProfileCandidateCommandResolution(outcome.resolution);
  if (!resolution) return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı şemaya uymuyor." };
  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  return dispatchCompanyProfileCandidateSurfaceCommand(descriptor.token, resolution.command);
}
export function describeCompanyProfileCandidateCommandExecutionResult(result: CompanyProfileCandidateCommandExecutionResult): string | null {
  if (result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return null;
  if (result.status === "CLARIFICATION_REQUIRED") return result.message;
  if (result.status === "STALE_SURFACE") return "Şirket profil ekranı artık aktif değil.";
  if (result.status === "VALIDATION_FAILED") return "Komutu anlayamadım, tekrar dener misin?";
  if (result.status === "EXECUTION_FAILED") return `İşlem başarısız: ${result.error}`;
  if (result.command.type === "commit") return "Değişiklik doğrudan yazılmadı; açık onay için Business Candidate oluşturuldu.";
  if (result.command.type === "discard") return "Değişiklikler geri alındı.";
  return `${result.appliedField} güncellendi (onay bekliyor).`;
}
