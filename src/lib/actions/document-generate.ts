import { createHash } from "node:crypto";

import { z } from "zod";

import { requireOrganizationAccess } from "../auth/organization-access";
import { db } from "../db";
import type { DocumentModel } from "../documents/document-model";
import { buildQuoteDocumentModel, QUOTE_DOCUMENT_KIND } from "../documents/sources/quote-document-source";
import { buildInvoiceDocumentModel, INVOICE_DOCUMENT_KIND } from "../documents/sources/invoice-document-source";
import { renderDocumentHtml } from "../documents/render-document-html";

const DocumentGenerateInputSchema = z.object({
  actorUserId: z.string().trim().min(1),
  organizationId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1).max(128),
  sourceType: z.enum(["Quote", "Invoice"]),
  sourceId: z.string().trim().min(1)
});

export type DocumentGenerateInput = z.input<typeof DocumentGenerateInputSchema>;

type ParsedInput = z.output<typeof DocumentGenerateInputSchema>;

export type VerifiedDocumentGenerateResult = {
  action: "document.generate";
  status: "VERIFIED";
  verified: true;
  replayed: boolean;
  document: {
    artifactId: string;
    kind: string;
    sourceType: "Quote" | "Invoice";
    sourceId: string;
    version: number;
    title: string;
    previewHtml: string;
  };
};

export class DocumentSourceNotFoundError extends Error {
  readonly code = "DOCUMENT_SOURCE_NOT_FOUND";
  constructor() {
    super("Document source was not found in the authorized organization");
    this.name = "DocumentSourceNotFoundError";
  }
}

export class DocumentIdempotencyConflictError extends Error {
  readonly code = "IDEMPOTENCY_CONFLICT";
  constructor() {
    super("Idempotency key was already used with different input");
    this.name = "DocumentIdempotencyConflictError";
  }
}

export class DocumentVerificationError extends Error {
  readonly code = "ACTION_VERIFICATION_FAILED";
  constructor() {
    super("Action could not be verified by readback");
    this.name = "DocumentVerificationError";
  }
}

const DOCUMENT_KIND_BY_SOURCE_TYPE: Record<ParsedInput["sourceType"], string> = {
  Quote: QUOTE_DOCUMENT_KIND,
  Invoice: INVOICE_DOCUMENT_KIND
};

const MAX_VERSION_ATTEMPTS = 5;

function isUniqueConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return (error as { code?: string }).code === "P2002";
}

function requestHash(input: ParsedInput): string {
  const canonical = JSON.stringify({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    sourceType: input.sourceType,
    sourceId: input.sourceId
  });
  return createHash("sha256").update(canonical).digest("hex");
}

async function buildModel(
  organizationId: string,
  sourceType: ParsedInput["sourceType"],
  sourceId: string
): Promise<{ model: DocumentModel; sourceSnapshot: string } | null> {
  if (sourceType === "Quote") return buildQuoteDocumentModel(organizationId, sourceId);
  return buildInvoiceDocumentModel(organizationId, sourceId);
}

function toResult(
  artifact: { id: string; kind: string; sourceType: string; sourceId: string; version: number; title: string; contentHtml: string },
  sourceType: ParsedInput["sourceType"],
  replayed: boolean
): VerifiedDocumentGenerateResult {
  return {
    action: "document.generate",
    status: "VERIFIED",
    verified: true,
    replayed,
    document: {
      artifactId: artifact.id,
      kind: artifact.kind,
      sourceType,
      sourceId: artifact.sourceId,
      version: artifact.version,
      title: artifact.title,
      previewHtml: artifact.contentHtml
    }
  };
}

async function readbackAndVerify(
  input: ParsedInput,
  artifactId: string,
  replayed: boolean
): Promise<VerifiedDocumentGenerateResult> {
  const artifact = await db.artifact.findFirst({
    where: { id: artifactId, organizationId: input.organizationId }
  });

  if (
    !artifact ||
    artifact.sourceType !== input.sourceType ||
    artifact.sourceId !== input.sourceId ||
    artifact.kind !== DOCUMENT_KIND_BY_SOURCE_TYPE[input.sourceType]
  ) {
    throw new DocumentVerificationError();
  }

  await db.actionExecution.update({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "document.generate",
        idempotencyKey: input.idempotencyKey
      }
    },
    data: { status: "VERIFIED", verifiedAt: new Date() }
  });

  return toResult(artifact, input.sourceType, replayed);
}

async function resolveExisting(
  input: ParsedInput,
  hash: string
): Promise<VerifiedDocumentGenerateResult | null> {
  const existing = await db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId: input.organizationId,
        actionType: "document.generate",
        idempotencyKey: input.idempotencyKey
      }
    }
  });

  if (!existing) return null;
  if (existing.requestHash !== hash) throw new DocumentIdempotencyConflictError();

  return readbackAndVerify(input, existing.resourceId, true);
}

export async function executeDocumentGenerate(
  rawInput: DocumentGenerateInput
): Promise<VerifiedDocumentGenerateResult> {
  const input = DocumentGenerateInputSchema.parse(rawInput);

  await requireOrganizationAccess({ userId: input.actorUserId, organizationId: input.organizationId });

  const hash = requestHash(input);

  const existing = await resolveExisting(input, hash);
  if (existing) return existing;

  const kind = DOCUMENT_KIND_BY_SOURCE_TYPE[input.sourceType];
  const built = await buildModel(input.organizationId, input.sourceType, input.sourceId);
  if (!built) throw new DocumentSourceNotFoundError();

  const contentHtml = renderDocumentHtml(built.model);

  let artifactId: string;

  try {
    const created = await db.$transaction(async tx => {
      const raceCheck = await tx.actionExecution.findUnique({
        where: {
          organizationId_actionType_idempotencyKey: {
            organizationId: input.organizationId,
            actionType: "document.generate",
            idempotencyKey: input.idempotencyKey
          }
        }
      });

      if (raceCheck) {
        if (raceCheck.requestHash !== hash) throw new DocumentIdempotencyConflictError();
        return { artifactId: raceCheck.resourceId, replayed: true };
      }

      let allocatedArtifactId: string | undefined;
      let lastError: unknown;

      for (let attempt = 0; attempt < MAX_VERSION_ATTEMPTS; attempt += 1) {
        const latest = await tx.artifact.findFirst({
          where: { organizationId: input.organizationId, kind, sourceType: input.sourceType, sourceId: input.sourceId },
          orderBy: { version: "desc" }
        });

        if (latest && latest.sourceSnapshot === built.sourceSnapshot) {
          allocatedArtifactId = latest.id;
          break;
        }

        try {
          const artifact = await tx.artifact.create({
            data: {
              organizationId: input.organizationId,
              kind,
              title: built.model.documentTitle,
              version: (latest?.version ?? 0) + 1,
              sourceType: input.sourceType,
              sourceId: input.sourceId,
              sourceSnapshot: built.sourceSnapshot,
              contentHtml
            }
          });

          allocatedArtifactId = artifact.id;
          break;
        } catch (error) {
          if (!isUniqueConflict(error)) throw error;
          lastError = error;
        }
      }

      if (!allocatedArtifactId) {
        throw lastError ?? new Error("Could not allocate a document artifact version");
      }

      await tx.actionExecution.create({
        data: {
          organizationId: input.organizationId,
          actionType: "document.generate",
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          resourceType: "Artifact",
          resourceId: allocatedArtifactId,
          status: "PENDING"
        }
      });

      return { artifactId: allocatedArtifactId, replayed: false };
    });

    artifactId = created.artifactId;

    if (created.replayed) {
      return readbackAndVerify(input, artifactId, true);
    }
  } catch (error) {
    if (error instanceof DocumentIdempotencyConflictError) throw error;
    if (!isUniqueConflict(error)) throw error;

    const raced = await resolveExisting(input, hash);
    if (!raced) throw error;
    return raced;
  }

  return readbackAndVerify(input, artifactId, false);
}
