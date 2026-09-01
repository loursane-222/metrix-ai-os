// Phase D1 — the smallest reusable boundary future Work Tool renderers
// (DOCX/PDF/PPTX) plug into. A format is just an identifier + a MIME type;
// the actual generation logic lives entirely in per-format renderer
// functions (see renderers/), never here. This file intentionally has no
// business-data types — those belong to each dataset (see datasets/).
export const ARTIFACT_FORMATS = ["xlsx", "docx", "pdf", "pptx"] as const;
export type ArtifactFormat = (typeof ARTIFACT_FORMATS)[number];

export const ARTIFACT_MIME_TYPES: Record<ArtifactFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// What a renderer hands back — buffer + filename only. No narration text:
// a renderer is a Work Tool, not a speaker (mirrors Phase A's
// ExternalEvidenceTool having no free-text field for the same reason).
export type GeneratedArtifactFile = Readonly<{
  format: ArtifactFormat;
  filename: string;
  mimeType: string;
  content: Buffer;
}>;

export function sanitizeArtifactFilenameSegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60) || "export";
}
