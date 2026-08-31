import type {
  ExternalEvidenceRequest,
  ExternalEvidenceResult,
  ExternalEvidenceTool,
} from "./external-evidence.types";

// The single canonical ownership seam between "METRIX decided external
// evidence is needed" and "canonical reasoning has structured evidence to
// work with". Deliberately not a workflow engine: one user intent can
// require several capabilities (Phase A, section 8's example — a meeting
// tomorrow needing address + route + weather), and this is the entire
// mechanism for that — a parallel fan-out over already-independent
// requests, the same pattern route.ts already uses everywhere else for
// concurrent reads (e.g. conversation/memory resolution). Tools never call
// each other; only this function calls tools, and only METRIX's own
// reasoning ever decides what to request.
//
// A tool that throws instead of returning a FAILED result (i.e. doesn't
// honor its own contract) is still caught and normalized here — this
// function is the last line stopping a raw exception (a stack trace, a
// provider's raw error string) from ever reaching canonical reasoning as if
// it were narratable content.
export async function collectExternalEvidence(
  requests: readonly ExternalEvidenceRequest[],
  tools: readonly ExternalEvidenceTool[],
): Promise<ExternalEvidenceResult[]> {
  const toolsByCapability = new Map(tools.map((tool) => [tool.capability, tool]));

  return Promise.all(
    requests.map(async (request): Promise<ExternalEvidenceResult> => {
      const retrievedAt = new Date().toISOString();
      const tool = toolsByCapability.get(request.capability);
      if (!tool) {
        return {
          status: "FAILED",
          capability: request.capability,
          query: request.query,
          retrievedAt,
          failureReason: "not_configured",
        };
      }
      try {
        return await tool.fetch(request.query);
      } catch {
        return {
          status: "FAILED",
          capability: request.capability,
          query: request.query,
          retrievedAt,
          failureReason: "provider_error",
        };
      }
    }),
  );
}
