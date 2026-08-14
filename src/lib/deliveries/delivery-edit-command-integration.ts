import { isRecord } from "@/lib/api/validation";
import { resolveDeliveryEditCommandRequest } from "./deliveries-client";
import { revalidateDeliveryEditCommandResolution, type DeliveryEditCommandExecutionResult } from "./delivery-edit-command-contract";
import { dispatchDeliveryEditSurfaceCommand, getActiveDeliveryEditSurfaceDescriptor } from "./delivery-edit-surface-command-channel";

export async function resolveAndDispatchDeliveryEditSurfaceCommand(utterance: string): Promise<DeliveryEditCommandExecutionResult | null> {
  const descriptor = getActiveDeliveryEditSurfaceDescriptor(); if (!descriptor) return null;
  const response = await resolveDeliveryEditCommandRequest(descriptor.entityId, { utterance, activeTab: descriptor.activeTab });
  if (!response.ok) return { status: "EXECUTION_FAILED", error: response.error };
  const outcome = response.data.outcome;
  if (!isRecord(outcome) || outcome.kind === "invalid_output") return { status: "VALIDATION_FAILED", reason: "Model çıktısı doğrulanamadı." };
  if (outcome.kind !== "resolved") return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı beklenmeyen biçimde." };
  const resolution = revalidateDeliveryEditCommandResolution(outcome.resolution); if (!resolution) return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı beklenen şemaya uymuyor." };
  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  return dispatchDeliveryEditSurfaceCommand(descriptor.token, resolution.command);
}

export function describeDeliveryEditCommandExecutionResult(result: DeliveryEditCommandExecutionResult): string | null {
  if (result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return null;
  if (result.status === "CLARIFICATION_REQUIRED") return result.message;
  if (result.status === "STALE_SURFACE") return "Bu irsaliye ekranı artık aktif değil; komut uygulanamadı.";
  if (result.status === "VALIDATION_FAILED") return "Komutu anlayamadım, tekrar dener misin?";
  if (result.status === "EXECUTION_FAILED") return `İşlem başarısız: ${result.error}`;
  switch (result.command.type) { case "flag_item_condition": return "İrsaliye kalem durumu güncellendi."; case "record_exception": return "Teslimat istisnası kaydedildi."; case "record_proof": return "Teslimat kanıtı kaydedildi."; case "transition_status": return "İrsaliye durumu güncellendi."; case "cancel": return "İrsaliye iptal edildi."; }
}
