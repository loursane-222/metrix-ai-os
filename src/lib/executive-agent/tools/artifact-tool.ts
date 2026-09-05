/**
 * Artifact tool — section 12: Executive Agent -> canonical dataset tool ->
 * canonical dataset -> renderer. generateCollectionsArtifact already reads
 * only the canonical Settlement-based collections dataset and hands it
 * straight to the requested renderer; this tool is a direct pass-through,
 * not a second dataset query.
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import { generateCollectionsArtifact, buildDeliverableArtifactPayload, type DeliverableArtifactPayload } from "@/lib/artifacts/collections-artifact.service";
import { resolvedEvidence, unresolvedEvidence, type ExecutiveAgentRunContext } from "../types";

export function buildCollectionsArtifactTool(
  runContext: ExecutiveAgentRunContext,
  onArtifactGenerated: (payload: DeliverableArtifactPayload) => void,
) {
  return tool({
    name: "generate_collections_artifact",
    description:
      "Generates last calendar month's collections (tahsilat) report as a downloadable file (XLSX/DOCX/PDF/PPTX) and queues it for delivery to the user. " +
      "This is currently the only company dataset available as an exportable artifact — do not claim other exports (invoices, orders, etc.) are available.",
    parameters: z.object({ format: z.enum(["XLSX", "DOCX", "PDF", "PPTX"]) }),
    async execute(input) {
      const outcome = await generateCollectionsArtifact(runContext.organizationId, runContext.timeZone, input.format.toLowerCase() as "xlsx" | "docx" | "pdf" | "pptx");
      if (outcome.status !== "GENERATED") {
        return unresolvedEvidence({ status: outcome.status === "EMPTY" ? "NOT_FOUND" : "SOURCE_UNAVAILABLE", factScope: "artifact.collections", source: "collections-artifact.service", detail: outcome.status });
      }
      onArtifactGenerated(buildDeliverableArtifactPayload(outcome.file));
      return resolvedEvidence({ factScope: "artifact.collections", data: { filename: outcome.file.filename, mimeType: outcome.file.mimeType, delivered: true }, source: "collections-artifact.service" });
    },
  });
}
