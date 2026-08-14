import { isRecord } from "@/lib/api/validation";
import { resolveInvoiceEditCommandRequest } from "./invoices-client";
import { revalidateInvoiceEditCommandResolution, type InvoiceEditCommandExecutionResult } from "./invoice-edit-command-contract";
import { dispatchInvoiceEditSurfaceCommand, getActiveInvoiceEditSurfaceDescriptor } from "./invoice-edit-surface-command-channel";

export async function resolveAndDispatchInvoiceEditSurfaceCommand(utterance: string): Promise<InvoiceEditCommandExecutionResult | null> {
  const descriptor = getActiveInvoiceEditSurfaceDescriptor(); if (!descriptor) return null;
  const response = await resolveInvoiceEditCommandRequest(descriptor.entityId, { utterance, activeTab: descriptor.activeTab });
  if (!response.ok) return { status: "EXECUTION_FAILED", error: response.error };
  const outcome = response.data.outcome;
  if (!isRecord(outcome) || outcome.kind === "invalid_output") return { status: "VALIDATION_FAILED", reason: "Model çıktısı doğrulanamadı." };
  if (outcome.kind !== "resolved") return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı beklenmeyen biçimde." };
  const resolution = revalidateInvoiceEditCommandResolution(outcome.resolution); if (!resolution) return { status: "VALIDATION_FAILED", reason: "Sunucu yanıtı beklenen şemaya uymuyor." };
  if (resolution.kind === "unsupported") return { status: "UNSUPPORTED" };
  if (resolution.kind === "clarification_required") return { status: "CLARIFICATION_REQUIRED", message: resolution.message };
  return dispatchInvoiceEditSurfaceCommand(descriptor.token, resolution.command);
}

export function describeInvoiceEditCommandExecutionResult(result: InvoiceEditCommandExecutionResult): string | null {
  if (result.status === "UNSUPPORTED" || result.status === "NO_ACTIVE_SURFACE") return null;
  if (result.status === "CLARIFICATION_REQUIRED") return result.message;
  if (result.status === "STALE_SURFACE") return "Bu fatura ekranı artık aktif değil; komut uygulanamadı.";
  if (result.status === "VALIDATION_FAILED") return "Komutu anlayamadım, tekrar dener misin?";
  if (result.status === "EXECUTION_FAILED") return `İşlem başarısız: ${result.error}`;
  return "Fatura gönderildi.";
}
