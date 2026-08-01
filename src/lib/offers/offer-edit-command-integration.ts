// The single entry point for one user utterance while an Offer Edit screen
// is mounted — mirrors customer-edit-command-integration.ts exactly.

import { resolveOfferEditCommand } from "./quotes-client";
import { revalidateOfferEditCommandResolution, type OfferEditCommandExecutionResult } from "./offer-edit-command-contract";
import { dispatchOfferEditSurfaceCommand, getActiveOfferEditSurfaceDescriptor } from "./offer-edit-surface-command-channel";
import { isRecord } from "@/lib/api/validation";

/**
 * Returns null when there is no mounted Offer Edit surface — the caller
 * should treat that as "not this feature's concern" and let the normal chat
 * flow proceed untouched.
 */
export async function resolveAndDispatchOfferEditSurfaceCommand(
  utterance: string,
): Promise<OfferEditCommandExecutionResult | null> {
  const descriptor = getActiveOfferEditSurfaceDescriptor();
  if (!descriptor) return null;

  const response = await resolveOfferEditCommand(descriptor.entityId, {
    utterance,
    activeTab: descriptor.activeTab,
  });

  if (!response.ok) {
    return { status: "EXECUTION_FAILED", error: response.error };
  }

  const outcomeRaw = response.data.outcome;
  if (!isRecord(outcomeRaw) || outcomeRaw.kind === "invalid_output") {
    return { status: "VALIDATION_FAILED", reason: "Model çıktısı doğrulanamadı." };
  }
  if (outcomeRaw.kind !== "resolved") {
    return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı beklenmeyen biçimde." };
  }

  const resolution = revalidateOfferEditCommandResolution(outcomeRaw.resolution);
  if (!resolution) {
    return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı beklenen şemaya uymuyor." };
  }

  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") {
    return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  }

  return dispatchOfferEditSurfaceCommand(descriptor.token, resolution.command);
}

/** Human-readable status line for the chat transcript. Returns null for outcomes that shouldn't produce a visible bubble. */
export function describeOfferEditCommandExecutionResult(result: OfferEditCommandExecutionResult): string | null {
  switch (result.status) {
    case "EXECUTED":
      if (result.command.type === "commit") {
        return result.commitOutcome === "SAVED_REFRESH_FAILED"
          ? "Değişiklikler kaydedildi ancak güncel veri yeniden yüklenemedi. Sayfayı yenileyin."
          : "Teklif kaydedildi.";
      }
      if (result.command.type === "discard") return "Değişiklikler geri alındı.";
      if (result.command.type === "select_tab") return null;
      if (result.command.type === "add_item") return `"${result.command.name}" kalemi eklendi.`;
      if (result.command.type === "remove_last_item") return "Son kalem silindi.";
      if (result.command.type === "set_item_price") return "Kalem fiyatı güncellendi.";
      if (result.command.type === "set_general_discount") return `Genel iskonto %${result.command.percent} olarak ayarlandı.`;
      return "Teklif güncellendi.";
    case "CLARIFICATION_REQUIRED":
      return result.message;
    case "UNSUPPORTED":
    case "NO_ACTIVE_SURFACE":
      return null;
    case "STALE_SURFACE":
      return "Bu ekran artık aktif değil; komut uygulanamadı.";
    case "VALIDATION_FAILED":
      return "Komutu anlayamadım, tekrar dener misin?";
    case "EXECUTION_FAILED":
      return `İşlem başarısız: ${result.error}`;
  }
}
