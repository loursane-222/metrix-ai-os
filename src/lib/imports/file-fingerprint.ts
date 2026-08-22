import { createHash } from "node:crypto";
import { prisma } from "@/lib/core/shared/prisma";

export function hashFileContent(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// Offer/Order/Payment/Stock rows have no reliable row-level identity (see
// their own *-import.service.ts comments — a real business can legitimately
// have two separate offers/orders/receivables/receipts that look identical
// field-by-field), so row-level duplicate detection would risk silently
// dropping genuinely distinct records. A file-level fingerprint is a much
// safer net for the actual risk this closes: re-uploading the exact same
// spreadsheet after an earlier commit. It only ever produces a soft,
// dismissible warning — it never excludes a row.
const LOOKBACK_HOURS = 72;

export async function findPriorFileImport(
  organizationId: string,
  targetDomain: string,
  fileHash: string,
): Promise<string | null> {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000);
  const candidate = await prisma.businessCandidate.findFirst({
    where: {
      organizationId,
      targetDomain,
      createdAt: { gte: since },
      provenanceJson: { path: ["fileHash"], equals: fileHash },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return candidate ? candidate.createdAt.toISOString() : null;
}
