import type { Document, DocumentSource, DocumentStatus } from "@prisma/client";

export type DocumentMetadata = Omit<Document, "content">;
export type DocumentWithContent = Document;

export type CreateDocumentInput = {
  organizationId: string;
  uploadedByUserId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  content: Buffer<ArrayBuffer>;
  relatedEntityType: string;
  relatedEntityId: string;
  documentType?: string;
  source?: DocumentSource;
};

export type ListDocumentsInput = {
  organizationId: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  status?: DocumentStatus;
};
