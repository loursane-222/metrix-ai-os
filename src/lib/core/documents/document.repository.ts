import { prisma } from "@/lib/core/shared/prisma";

import type { CreateDocumentInput, DocumentMetadata, DocumentWithContent, ListDocumentsInput } from "./document.types";

const METADATA_SELECT = {
  id: true, organizationId: true, uploadedByUserId: true, filename: true, mimeType: true, sizeBytes: true,
  relatedEntityType: true, relatedEntityId: true, documentType: true, version: true, status: true, source: true,
  verified: true, createdAt: true, updatedAt: true,
} as const;

export async function createDocument(input: CreateDocumentInput): Promise<DocumentMetadata> {
  return prisma.document.create({
    data: {
      organizationId: input.organizationId,
      uploadedByUserId: input.uploadedByUserId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      content: input.content,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      documentType: input.documentType ?? "OTHER",
      source: input.source ?? "UPLOAD",
    },
    select: METADATA_SELECT,
  });
}

export async function listDocumentsForOrganization(input: ListDocumentsInput): Promise<DocumentMetadata[]> {
  return prisma.document.findMany({
    where: {
      organizationId: input.organizationId,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      status: input.status,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: METADATA_SELECT,
  });
}

export async function findDocumentMetadataById(documentId: string, organizationId: string): Promise<DocumentMetadata | null> {
  return prisma.document.findFirst({ where: { id: documentId, organizationId }, select: METADATA_SELECT });
}

export async function findDocumentWithContentById(documentId: string, organizationId: string): Promise<DocumentWithContent | null> {
  return prisma.document.findFirst({ where: { id: documentId, organizationId } });
}

export async function archiveDocumentRecord(documentId: string, organizationId: string): Promise<DocumentMetadata | null> {
  const existing = await prisma.document.findFirst({ where: { id: documentId, organizationId }, select: { id: true, status: true } });
  if (!existing) return null;
  if (existing.status === "ARCHIVED") return findDocumentMetadataById(documentId, organizationId);
  return prisma.document.update({ where: { id: documentId, organizationId }, data: { status: "ARCHIVED" }, select: METADATA_SELECT });
}
