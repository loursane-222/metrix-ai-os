import { ApiValidationError } from "@/lib/api/validation";

import {
  archiveDocumentRecord,
  createDocument,
  findDocumentMetadataById,
  findDocumentWithContentById,
  listDocumentsForOrganization,
} from "./document.repository";

import type { CreateDocumentInput, DocumentMetadata, DocumentWithContent, ListDocumentsInput } from "./document.types";

export const DOCUMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export function sanitizeDocumentFilename(value: string): string {
  const name = value.normalize("NFKC").replace(/[\\/\0\r\n]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120);
  return name && name !== "." && name !== ".." ? name : "document";
}

export function validateDocumentFile(file: Pick<File, "name" | "type" | "size">): void {
  if (!DOCUMENT_MIME_TYPES.includes(file.type as (typeof DOCUMENT_MIME_TYPES)[number])) throw new Error("DOCUMENT_UNSUPPORTED_MIME");
  if (!file.size || file.size > DOCUMENT_MAX_BYTES) throw new Error("DOCUMENT_SIZE_INVALID");
}

export async function createNewDocument(input: CreateDocumentInput): Promise<DocumentMetadata> {
  assertNonEmpty(input.organizationId, "organizationId");
  assertNonEmpty(input.uploadedByUserId, "uploadedByUserId");
  assertNonEmpty(input.relatedEntityType, "relatedEntityType");
  assertNonEmpty(input.relatedEntityId, "relatedEntityId");
  return createDocument(input);
}

export async function listDocuments(input: ListDocumentsInput): Promise<DocumentMetadata[]> {
  assertNonEmpty(input.organizationId, "organizationId");
  return listDocumentsForOrganization(input);
}

export async function findDocumentById(documentId: string, organizationId: string): Promise<DocumentMetadata | null> {
  assertNonEmpty(documentId, "documentId");
  assertNonEmpty(organizationId, "organizationId");
  return findDocumentMetadataById(documentId, organizationId);
}

export async function findDocumentContentById(documentId: string, organizationId: string): Promise<DocumentWithContent | null> {
  assertNonEmpty(documentId, "documentId");
  assertNonEmpty(organizationId, "organizationId");
  return findDocumentWithContentById(documentId, organizationId);
}

export async function archiveDocument(documentId: string, organizationId: string): Promise<DocumentMetadata | null> {
  assertNonEmpty(documentId, "documentId");
  assertNonEmpty(organizationId, "organizationId");
  return archiveDocumentRecord(documentId, organizationId);
}

export function mapDocumentError(error: unknown): { message: string; status: number } | null {
  const code = error instanceof Error ? error.message : "";
  if (code === "DOCUMENT_UNSUPPORTED_MIME") return { message: "Desteklenen biçimler JPEG, PNG, WebP ve PDF'dir.", status: 415 };
  if (code === "DOCUMENT_SIZE_INVALID") return { message: "Dosya 10 MB sınırını aşıyor veya boş.", status: 413 };
  return null;
}

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (!value || value.trim().length === 0) throw new ApiValidationError(`${field} is required.`);
}
