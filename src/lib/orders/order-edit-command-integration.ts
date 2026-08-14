import { isRecord } from "@/lib/api/validation";
import { resolveOrderEditCommandRequest } from "./orders-client";
import { revalidateOrderEditCommandResolution, type OrderEditCommandExecutionResult } from "./order-edit-command-contract";
import { dispatchOrderEditSurfaceCommand, getActiveOrderEditSurfaceDescriptor } from "./order-edit-surface-command-channel";

export async function resolveAndDispatchOrderEditSurfaceCommand(utterance: string): Promise<OrderEditCommandExecutionResult | null> {
  const descriptor = getActiveOrderEditSurfaceDescriptor(); if (!descriptor) return null;
  const response = await resolveOrderEditCommandRequest(descriptor.entityId, { utterance, activeTab: descriptor.activeTab });
  if (!response.ok) return { status: "EXECUTION_FAILED", error: response.error };
  const outcome = response.data.outcome;
  if (!isRecord(outcome) || outcome.kind === "invalid_output") return { status: "VALIDATION_FAILED", reason: "Model çıktısı doğrulanamadı." };
  if (outcome.kind !== "resolved") return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı beklenmeyen biçimde." };
  const resolution = revalidateOrderEditCommandResolution(outcome.resolution); if (!resolution) return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı beklenen şemaya uymuyor." };
  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  return dispatchOrderEditSurfaceCommand(descriptor.token, resolution.command);
}

export function describeOrderEditCommandExecutionResult(result: OrderEditCommandExecutionResult): string | null {
  if (result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return null;
  if (result.status === "CLARIFICATION_REQUIRED") return result.message;
  if (result.status === "STALE_SURFACE") return "Bu sipariş ekranı artık aktif değil; komut uygulanamadı.";
  if (result.status === "VALIDATION_FAILED") return "Komutu anlayamadım, tekrar dener misin?";
  if (result.status === "EXECUTION_FAILED") return `İşlem başarısız: ${result.error}`;
  switch (result.command.type) { case "revise_quantity": return "Sipariş miktarı güncellendi."; case "revise_deadline": return "Teslim tarihi güncellendi."; case "remove_item": return "Sipariş kalemi silindi."; case "record_exception": return "Sipariş istisnası kaydedildi."; case "transition_status": return "Sipariş durumu güncellendi."; case "cancel": return "Sipariş iptal edildi."; }
}
