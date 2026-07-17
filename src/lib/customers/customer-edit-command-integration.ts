// The single entry point both written chat (MetrixChatTab.send()) and voice
// (the same send() call, reached from useVoiceExperienceOrchestrator's
// finalized-transcript callback) call for one user utterance. Deliberately
// framework-agnostic client-side glue: reads the active surface off the
// command channel, resolves the utterance over the network, re-validates the
// response at this client/server boundary, and dispatches through the
// channel — never touches React state itself (the caller decides how to
// show the result).

import { resolveCustomerEditCommand } from "./customers-client";
import {
  customerEditCommandFieldPathToString,
  revalidateCustomerEditCommandResolution,
  type CustomerEditCommandExecutionResult,
} from "./customer-edit-command-contract";
import {
  dispatchCustomerEditSurfaceCommand,
  getActiveCustomerEditSurfaceDescriptor,
} from "./customer-edit-surface-command-channel";
import { isRecord } from "@/lib/api/validation";

/**
 * Returns null when there is no mounted Customer Edit surface at all — the
 * caller should treat that as "not this feature's concern" and let the
 * normal chat flow proceed untouched, without spending a network round trip
 * on a resolver call that could never apply anywhere.
 */
export async function resolveAndDispatchCustomerEditSurfaceCommand(
  utterance: string,
): Promise<CustomerEditCommandExecutionResult | null> {
  const descriptor = getActiveCustomerEditSurfaceDescriptor();
  if (!descriptor) return null;

  const response = await resolveCustomerEditCommand(descriptor.entityId, {
    utterance,
    activeTab: descriptor.activeTab,
  });

  if (!response.ok) {
    return { status: "EXECUTION_FAILED", error: response.error };
  }

  const outcomeRaw = response.data.outcome;
  if (!isRecord(outcomeRaw) || outcomeRaw.kind === "invalid_output") {
    return { status: "VALIDATION_FAILED", reason: "Model ciktisi dogrulanamadi." };
  }
  if (outcomeRaw.kind !== "resolved") {
    return { status: "VALIDATION_FAILED", reason: "Sunucu yaniti beklenmeyen bicimde." };
  }

  // Re-validates from scratch against the raw wire payload — never trusts
  // that the server's own validation survived the network unmodified.
  const resolution = revalidateCustomerEditCommandResolution(outcomeRaw.resolution);
  if (!resolution) {
    return { status: "VALIDATION_FAILED", reason: "Sunucu yaniti beklenen semaya uymuyor." };
  }

  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") {
    return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  }

  return dispatchCustomerEditSurfaceCommand(descriptor.token, resolution.command);
}

/** Human-readable status line for the chat transcript. Returns null for outcomes that shouldn't produce a visible bubble. */
export function describeCustomerEditCommandExecutionResult(result: CustomerEditCommandExecutionResult): string | null {
  switch (result.status) {
    case "EXECUTED":
      if (result.command.type === "commit") {
        return result.commitOutcome === "SAVED_REFRESH_FAILED"
          ? "Degisiklikler kaydedildi ancak guncel veri yeniden yuklenemedi. Sayfayi yenileyin."
          : "Degisiklikler kaydedildi.";
      }
      if (result.command.type === "discard") {
        return (result.revertedFields?.length ?? 0) > 0
          ? "Degisiklikler geri alindi."
          : "Geri alinacak bir degisiklik yoktu.";
      }
      if (result.command.type === "select_tab") return null;
      return `${result.appliedField} ${describeAppliedValue(result.appliedValue)}.`;
    case "CLARIFICATION_REQUIRED":
      return result.message;
    case "UNSUPPORTED":
    case "NO_ACTIVE_SURFACE":
      return null;
    case "STALE_SURFACE":
      return "Bu ekran artik aktif degil; komut uygulanamadi.";
    case "VALIDATION_FAILED":
      return "Komutu anlayamadim, tekrar dener misin?";
    case "EXECUTION_FAILED":
      return `Islem basarisiz: ${result.error}`;
  }
}

function describeAppliedValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "temizlendi";
  return `"${String(value)}" olarak guncellendi`;
}

// Re-exported for callers that only need to render a field path, not run the
// full command (kept here so chat UI code has one import for both).
export { customerEditCommandFieldPathToString };
