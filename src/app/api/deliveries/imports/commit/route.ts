import { fail, ok } from "@/lib/api/response";
import { ApiValidationError, readJsonObject } from "@/lib/api/validation";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import {
  createBusinessCandidateActionRuntimeExecutor,
  decideBusinessCandidateChanges,
  persistBusinessPropositions,
  promoteBusinessCandidate,
} from "@/lib/business-reality-candidates";
import { buildPropositionsFromReviewedRows, type ImportPreviewRow } from "@/lib/imports/delivery-import.service";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const rows = readImportRows(body.rows);
    const fileHash = typeof body.fileHash === "string" ? body.fileHash : undefined;
    const propositions = buildPropositionsFromReviewedRows(rows).map((proposition) => (
      fileHash ? { ...proposition, provenance: { ...proposition.provenance, fileHash } } : proposition
    ));
    if (!propositions.length) throw new ApiValidationError("İçe aktarılacak satır bulunamadı.");

    const sourceMessageId = crypto.randomUUID();
    const candidates = await persistBusinessPropositions({
      organizationId: auth.organization.id,
      sourceChannel: "ERP_IMPORT",
      sourceMessageId,
      sourceInputId: sourceMessageId,
      propositions,
    });

    const executor = createBusinessCandidateActionRuntimeExecutor(auth);
    const failed: Array<{ rowIndex: number; error: string }> = [];
    let created = 0;
    for (const [index, candidate] of candidates.entries()) {
      try {
        const decided = await decideBusinessCandidateChanges({
          organizationId: auth.organization.id,
          candidateId: candidate.id,
          actorUserId: auth.user.id,
          approvedChangeIds: candidate.changes.map((change) => change.id),
          rejectedChangeIds: [],
        });
        if (decided.status !== "APPROVED" && decided.status !== "PARTIALLY_APPROVED") {
          throw new Error("BUSINESS_CANDIDATE_NOT_APPROVED");
        }
        await promoteBusinessCandidate({
          organizationId: auth.organization.id,
          candidateId: candidate.id,
          actorUserId: auth.user.id,
          execute: executor,
        });
        created += 1;
      } catch (error) {
        failed.push({ rowIndex: propositions[index]?.provenance.rowIndex as number ?? index, error: error instanceof Error ? error.message : "Bilinmeyen hata" });
      }
    }

    return ok({ sourceMessageId, created, failed });
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, error.status);
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[delivery_import_commit] failed", { errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return fail("İçe aktarma tamamlanamadı.", 500);
  }
}

function readImportRows(value: unknown): ImportPreviewRow[] {
  if (!Array.isArray(value)) throw new ApiValidationError("rows must be an array.");
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new ApiValidationError(`rows[${index}] must be an object.`);
    }
    const row = item as Record<string, unknown>;
    if (typeof row.rowIndex !== "number") throw new ApiValidationError(`rows[${index}].rowIndex is required.`);
    if (typeof row.values !== "object" || row.values === null) throw new ApiValidationError(`rows[${index}].values is required.`);
    if (typeof row.orderMatch !== "object" || row.orderMatch === null) throw new ApiValidationError(`rows[${index}].orderMatch is required.`);
    return {
      rowIndex: row.rowIndex,
      values: row.values as ImportPreviewRow["values"],
      orderMatch: row.orderMatch as ImportPreviewRow["orderMatch"],
      excluded: Boolean(row.excluded),
    } satisfies ImportPreviewRow;
  });
}
