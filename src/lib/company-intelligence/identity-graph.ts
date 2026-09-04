import { prisma } from "@/lib/core/shared/prisma";
import { normalizeEntityDisplayName, resolveIdentityFromCandidates, type IdentityMatchCandidate } from "./identity-resolution";
import type { CanonicalEntityDescriptor, ExternalEntityIdentityDescriptor, ExternalIdentityMatchMethod, IdentityResolution } from "./types";

type CanonicalEntityRow = { id: string; organizationId: string; entityType: string; canonicalDisplayName: string; status: string };
type ExternalEntityIdentityRow = {
  id: string;
  organizationId: string;
  canonicalEntityId: string;
  sourceId: string;
  externalEntityType: string;
  externalEntityId: string;
  externalDisplayName: string | null;
  matchMethod: string;
  matchConfidence: unknown;
};

function toCanonicalEntity(row: CanonicalEntityRow): CanonicalEntityDescriptor {
  return {
    canonicalEntityId: row.id,
    organizationId: row.organizationId,
    entityType: row.entityType,
    canonicalDisplayName: row.canonicalDisplayName,
    status: row.status as CanonicalEntityDescriptor["status"],
  };
}

function toExternalIdentity(row: ExternalEntityIdentityRow): ExternalEntityIdentityDescriptor {
  return {
    id: row.id,
    organizationId: row.organizationId,
    canonicalEntityId: row.canonicalEntityId,
    sourceId: row.sourceId,
    externalEntityType: row.externalEntityType,
    externalEntityId: row.externalEntityId,
    externalDisplayName: row.externalDisplayName,
    matchMethod: row.matchMethod as ExternalIdentityMatchMethod,
    matchConfidence: row.matchConfidence === null || row.matchConfidence === undefined ? null : Number(row.matchConfidence),
  };
}

export async function getCanonicalEntity(organizationId: string, canonicalEntityId: string): Promise<CanonicalEntityDescriptor | null> {
  const row = await prisma.canonicalEntity.findFirst({ where: { id: canonicalEntityId, organizationId } });
  return row ? toCanonicalEntity(row) : null;
}

export async function listExternalIdentities(organizationId: string, canonicalEntityId: string): Promise<readonly ExternalEntityIdentityDescriptor[]> {
  const rows = await prisma.externalEntityIdentity.findMany({ where: { organizationId, canonicalEntityId } });
  return rows.map(toExternalIdentity);
}

export async function findExternalIdentityForSource(
  organizationId: string,
  canonicalEntityId: string,
  sourceId: string,
): Promise<ExternalEntityIdentityDescriptor | null> {
  const row = await prisma.externalEntityIdentity.findFirst({ where: { organizationId, canonicalEntityId, sourceId } });
  return row ? toExternalIdentity(row) : null;
}

export async function findExternalIdentity(
  organizationId: string,
  sourceId: string,
  externalEntityType: string,
  externalEntityId: string,
): Promise<ExternalEntityIdentityDescriptor | null> {
  const row = await prisma.externalEntityIdentity.findUnique({
    where: { organizationId_sourceId_externalEntityType_externalEntityId: { organizationId, sourceId, externalEntityType, externalEntityId } },
  });
  return row ? toExternalIdentity(row) : null;
}

export type IngestExternalRecordInput = {
  readonly organizationId: string;
  readonly entityType: string;
  readonly sourceId: string;
  readonly externalEntityId: string;
  readonly externalDisplayName: string;
  /** Strongest evidence: caller already knows which canonical entity this is (e.g. the native source, which IS the anchor system). */
  readonly explicitCanonicalEntityId?: string;
  /** Caller-normalized stable identifier (e.g. a tax number), only used by the DETERMINISTIC_IDENTIFIER tier. */
  readonly deterministicIdentifier?: string;
};

export type IngestExternalRecordOutcome =
  | { readonly resolution: "LINKED"; readonly canonicalEntityId: string; readonly created: boolean }
  | { readonly resolution: "AMBIGUOUS"; readonly candidateCanonicalEntityIds: readonly string[] };

/**
 * Links one external record to the Identity Graph — the only write path
 * into it. Idempotent: a record already linked from this exact source is
 * returned as-is, never re-matched. A brand-new record either joins an
 * existing canonical entity (via one of the three real evidence tiers — see
 * identity-resolution.ts) or mints a new one; it is never silently merged
 * into an existing entity on a guess, and an AMBIGUOUS tier match is
 * surfaced to the caller instead of being resolved here.
 */
export async function ingestExternalRecord(input: IngestExternalRecordInput): Promise<IngestExternalRecordOutcome> {
  const existing = await findExternalIdentity(input.organizationId, input.sourceId, input.entityType, input.externalEntityId);
  if (existing) return { resolution: "LINKED", canonicalEntityId: existing.canonicalEntityId, created: false };

  const resolution = await resolveCandidateCanonicalEntity(input);
  if (resolution.status === "AMBIGUOUS") return { resolution: "AMBIGUOUS", candidateCanonicalEntityIds: resolution.candidateCanonicalEntityIds };

  if (resolution.status === "RESOLVED") {
    await prisma.externalEntityIdentity.create({
      data: {
        organizationId: input.organizationId,
        canonicalEntityId: resolution.canonicalEntityId,
        sourceId: input.sourceId,
        externalEntityType: input.entityType,
        externalEntityId: input.externalEntityId,
        externalDisplayName: input.externalDisplayName,
        deterministicIdentifier: input.deterministicIdentifier,
        matchMethod: resolution.method,
        matchConfidence: resolution.confidence,
      },
    });
    return { resolution: "LINKED", canonicalEntityId: resolution.canonicalEntityId, created: false };
  }

  // UNRESOLVED: no existing canonical entity matched by any real-evidence
  // tier — mint one and link it in the same transaction so no external
  // record is ever left pointing at nothing.
  const canonicalEntityId = await prisma.$transaction(async (tx) => {
    const canonicalEntity = await tx.canonicalEntity.create({
      data: { organizationId: input.organizationId, entityType: input.entityType, canonicalDisplayName: input.externalDisplayName },
    });
    await tx.externalEntityIdentity.create({
      data: {
        organizationId: input.organizationId,
        canonicalEntityId: canonicalEntity.id,
        sourceId: input.sourceId,
        externalEntityType: input.entityType,
        externalEntityId: input.externalEntityId,
        externalDisplayName: input.externalDisplayName,
        deterministicIdentifier: input.deterministicIdentifier,
        matchMethod: "NEW_CANONICAL_MINTED" satisfies ExternalIdentityMatchMethod,
        matchConfidence: 1,
      },
    });
    return canonicalEntity.id;
  });
  return { resolution: "LINKED", canonicalEntityId, created: true };
}

async function resolveCandidateCanonicalEntity(input: IngestExternalRecordInput): Promise<IdentityResolution> {
  if (input.explicitCanonicalEntityId) {
    return { status: "RESOLVED", canonicalEntityId: input.explicitCanonicalEntityId, method: "EXPLICIT_MAPPING", confidence: 1 };
  }

  const explicit: IdentityMatchCandidate[] = [];

  const deterministic: IdentityMatchCandidate[] = [];
  if (input.deterministicIdentifier) {
    const matches = await prisma.externalEntityIdentity.findMany({
      where: { organizationId: input.organizationId, deterministicIdentifier: input.deterministicIdentifier },
      distinct: ["canonicalEntityId"],
      select: { canonicalEntityId: true },
    });
    for (const match of matches) deterministic.push({ canonicalEntityId: match.canonicalEntityId, method: "DETERMINISTIC_IDENTIFIER", confidence: 0.95 });
  }

  const normalizedName: IdentityMatchCandidate[] = [];
  if (deterministic.length === 0) {
    const normalized = normalizeEntityDisplayName(input.externalDisplayName);
    const candidateEntities = await prisma.canonicalEntity.findMany({
      where: { organizationId: input.organizationId, entityType: input.entityType, status: "ACTIVE" },
      select: { id: true, canonicalDisplayName: true },
    });
    for (const candidate of candidateEntities) {
      if (normalizeEntityDisplayName(candidate.canonicalDisplayName) === normalized) {
        normalizedName.push({ canonicalEntityId: candidate.id, method: "EXACT_NORMALIZED_NAME", confidence: 0.8 });
      }
    }
  }

  return resolveIdentityFromCandidates({ explicit, deterministic, normalizedName });
}
