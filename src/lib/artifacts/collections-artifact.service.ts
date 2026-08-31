import { resolvePreviousCalendarMonthRange } from "./date-ranges";
import { buildCollectionsDataset, type CollectionsDataset } from "./datasets/collections-dataset.service";
import { renderCollectionsXlsx } from "./renderers/collections-xlsx-renderer";
import type { GeneratedArtifactFile } from "./artifact.types";

// The single orchestration seam for the collections (tahsilat) Work Tool:
// resolve the deterministic period, read the canonical dataset, render the
// file from it (never anything else). route.ts only calls
// generateCollectionsArtifact and the two prompt/delivery builders below —
// it never touches the dataset/renderer/date-range modules directly, the
// same "one small resolver, route.ts stays thin" shape as Phase B/C's
// conversation-research-tool.ts.
export type CollectionsArtifactOutcome =
  | Readonly<{ status: "GENERATED"; dataset: CollectionsDataset; file: GeneratedArtifactFile }>
  | Readonly<{ status: "EMPTY"; dataset: CollectionsDataset }>
  | Readonly<{ status: "FAILED"; reason: "query_failed" | "render_failed" }>;

export async function generateCollectionsArtifact(
  organizationId: string,
  timeZone: string,
): Promise<CollectionsArtifactOutcome> {
  const period = resolvePreviousCalendarMonthRange(new Date(), timeZone);
  let dataset: CollectionsDataset;
  try {
    dataset = await buildCollectionsDataset(organizationId, period);
  } catch (error: unknown) {
    console.error("[CollectionsArtifact] dataset query failed", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { status: "FAILED", reason: "query_failed" };
  }
  if (dataset.recordCount === 0) return { status: "EMPTY", dataset };
  try {
    const file = await renderCollectionsXlsx(dataset);
    return { status: "GENERATED", dataset, file };
  } catch (error: unknown) {
    console.error("[CollectionsArtifact] xlsx render failed", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { status: "FAILED", reason: "render_failed" };
  }
}

// Same structured-evidence-line convention as buildExternalEvidencePromptLine
// (Phase B): the dataset's own count/total/period are the only numbers the
// model is told to use, so chat narration can never diverge from what the
// file actually contains (Artifact Truth). On failure/empty, explicitly
// forbids claiming a file exists — mirrors the honest-failure contract
// already established for external evidence.
export function buildCollectionsArtifactPromptLine(outcome: CollectionsArtifactOutcome): string {
  if (outcome.status === "FAILED") {
    return `Artifact generation FAILED just now for the collections (tahsilat) Excel export requested this turn (internal reason: ${outcome.reason}). You must NOT say a file was generated, is ready, or is downloadable — no file exists for this turn. Tell the user honestly that the export could not be completed right now and they can try again shortly.`;
  }
  if (outcome.status === "EMPTY") {
    return `The user asked for a "${outcome.dataset.period.label}" (${outcome.dataset.period.isoLabel}) collections (tahsilat) Excel export. The canonical repository has zero real collection records for exactly this period — this is real, already-checked data, not a failure or missing capability. No file was generated, because there is nothing to export. Tell the user honestly that no collections are recorded for that period; never claim a file exists, was generated, or was sent.`;
  }
  const totals = Object.entries(outcome.dataset.totalsByCurrency).map(([currency, total]) => `${total} ${currency}`).join(", ") || "0";
  return `A real XLSX file was just generated in this same turn from the canonical collections (tahsilat) dataset for "${outcome.dataset.period.label}" (${outcome.dataset.period.isoLabel}): ${outcome.dataset.recordCount} kayıt, toplam ${totals}. This is the exact same dataset the file was built from — never state a different count or total than these exact numbers. Confirm the file is ready for download and state the record count and total using these numbers.`;
}

export type DeliverableArtifactPayload = Readonly<{
  filename: string;
  mimeType: string;
  dataUrl: string;
}>;

// Delivered inline as a data: URL within this same authenticated response —
// no separate storage table or download route exists in this repository
// (confirmed during discovery), and none is required: the file only ever
// travels inside the same auth-gated /api/ai/chat response the user already
// trusts, so there is no separate shareable URL to secure or expire.
export function buildDeliverableArtifactPayload(file: GeneratedArtifactFile): DeliverableArtifactPayload {
  return {
    filename: file.filename,
    mimeType: file.mimeType,
    dataUrl: `data:${file.mimeType};base64,${file.content.toString("base64")}`,
  };
}
