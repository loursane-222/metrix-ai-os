import { resolvePreviousCalendarMonthRange } from "./date-ranges";
import { buildCollectionsDataset, type CollectionsDataset } from "./datasets/collections-dataset.service";
import { renderCollectionsXlsx } from "./renderers/collections-xlsx-renderer";
import { renderCollectionsDocx } from "./renderers/collections-docx-renderer";
import { renderCollectionsPdf } from "./renderers/collections-pdf-renderer";
import { renderCollectionsPptx } from "./renderers/collections-pptx-renderer";
import type { ArtifactFormat, GeneratedArtifactFile } from "./artifact.types";

// One renderer per format, all operating on the identical CollectionsDataset
// — this map is the entire "format model" (Phase D2, section 4/7): adding a
// future format is one more entry here, never a second dataset or a second
// classifier. Phase D3 — renderCollectionsPptx keeps the exact same
// (dataset: CollectionsDataset) => Promise<GeneratedArtifactFile> shape as
// every other renderer here; it internally derives its own management
// summary and presentation model from that same dataset (see the renderer's
// own file) rather than widening this map's type.
const COLLECTIONS_RENDERERS: Record<ArtifactFormat, (dataset: CollectionsDataset) => Promise<GeneratedArtifactFile>> = {
  xlsx: renderCollectionsXlsx,
  docx: renderCollectionsDocx,
  pdf: renderCollectionsPdf,
  pptx: renderCollectionsPptx,
};

// The single orchestration seam for the collections (tahsilat) Work Tool:
// resolve the deterministic period, read the canonical dataset, render the
// file from it (never anything else). route.ts only calls
// generateCollectionsArtifact and the two prompt/delivery builders below —
// it never touches the dataset/renderer/date-range modules directly, the
// same "one small resolver, route.ts stays thin" shape as Phase B/C's
// conversation-research-tool.ts.
// EMPTY and FAILED carry the requested `format` too (not just GENERATED,
// via file.format) — proven production bug: without it, the narration line
// for those two outcomes had no way to know which format was actually
// requested and fell back to a hardcoded literal ("Excel export" for every
// format, including PPTX/DOCX/PDF requests). See buildCollectionsArtifactPromptLine.
export type CollectionsArtifactOutcome =
  | Readonly<{ status: "GENERATED"; dataset: CollectionsDataset; file: GeneratedArtifactFile }>
  | Readonly<{ status: "EMPTY"; dataset: CollectionsDataset; format: ArtifactFormat }>
  | Readonly<{ status: "FAILED"; reason: "query_failed" | "render_failed"; format: ArtifactFormat }>;

export async function generateCollectionsArtifact(
  organizationId: string,
  timeZone: string,
  format: ArtifactFormat,
): Promise<CollectionsArtifactOutcome> {
  const period = resolvePreviousCalendarMonthRange(new Date(), timeZone);
  let dataset: CollectionsDataset;
  try {
    dataset = await buildCollectionsDataset(organizationId, period);
  } catch (error: unknown) {
    console.error("[CollectionsArtifact] dataset query failed", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { status: "FAILED", reason: "query_failed", format };
  }
  if (dataset.recordCount === 0) return { status: "EMPTY", dataset, format };
  try {
    const file = await COLLECTIONS_RENDERERS[format](dataset);
    return { status: "GENERATED", dataset, file };
  } catch (error: unknown) {
    console.error("[CollectionsArtifact] render failed", {
      format,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return { status: "FAILED", reason: "render_failed", format };
  }
}

// Same structured-evidence-line convention as buildExternalEvidencePromptLine
// (Phase B): the dataset's own count/total/period are the only numbers the
// model is told to use, so chat narration can never diverge from what the
// file actually contains (Artifact Truth). On failure/empty, explicitly
// forbids claiming a file exists — mirrors the honest-failure contract
// already established for external evidence.
//
// Every branch also asserts this outcome's authority for the turn — proven
// production bug (2026-09-01): when this line was absent (or, before this
// fix, silently mislabeled), a co-present generic "payments" canonical-facts
// line (a raw Payment status list, unscoped by period — see
// canonical-business-facts.service.ts) was used by the model as a stand-in
// for period collection-performance data, producing a hedging answer that
// asked the user for clarification instead of using this outcome. That
// generic payment list is a different, non-period-scoped view and must
// never substitute for this outcome, in any of the three branches below.
export function buildCollectionsArtifactPromptLine(outcome: CollectionsArtifactOutcome): string {
  const authorityClause =
    " This is the authoritative outcome for this turn's collection/tahsilat export request — it is not optional context. Do not contradict it, do not ask the user what data/details to include (the request was already complete), and never use a general payment status list (paid/pending/overdue) as a substitute for it — that is different, non-period-scoped data.";

  if (outcome.status === "FAILED") {
    const label = outcome.format.toUpperCase();
    return `Artifact generation FAILED just now for the collections (tahsilat) ${label} export requested this turn (internal reason: ${outcome.reason}).${authorityClause} You must NOT say a file was generated, is ready, or is downloadable — no file exists for this turn. You must NOT deny that ${label} export is a real capability — it is; this specific attempt simply failed right now. Tell the user honestly that the export could not be completed right now and they can try again shortly.`;
  }
  if (outcome.status === "EMPTY") {
    const label = outcome.format.toUpperCase();
    return `The user asked for a "${outcome.dataset.period.label}" (${outcome.dataset.period.isoLabel}) collections (tahsilat) ${label} export. The canonical repository has zero real collection records for exactly this period — this is real, already-checked data, not a failure or missing capability.${authorityClause} Do not invent a different period. No file was generated, because there is nothing to export. Tell the user honestly that no collections are recorded for that exact period; never claim a file exists, was generated, or was sent.`;
  }
  const label = outcome.file.format.toUpperCase();
  const totals = Object.entries(outcome.dataset.totalsByCurrency).map(([currency, total]) => `${total} ${currency}`).join(", ") || "0";
  return `A real ${label} file was just generated in this same turn from the canonical collections (tahsilat) dataset for "${outcome.dataset.period.label}" (${outcome.dataset.period.isoLabel}): ${outcome.dataset.recordCount} kayıt, toplam ${totals}. This is the exact same dataset the file was built from — never state a different count, total, or period than these exact values.${authorityClause} Do not deny that ${label} export is a real capability. Confirm the file is ready for download and state the record count and total using these numbers.`;
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
