import { randomUUID } from "crypto";
import { prisma } from "@/lib/core/shared/prisma";
import { assertFileSignatureMatchesDeclaredMime } from "@/lib/documents/file-signature";
import {
  CUSTOMER_ATTACHMENT_MAX_BYTES,
  CUSTOMER_ATTACHMENT_MIME_TYPES,
  CUSTOMER_ATTACHMENT_TTL_MS,
  sanitizeCustomerAttachmentFilename,
} from "@/lib/customers/customer-document-attachment.service";

// Phase 14 (Document Intelligence) — reuses the exact same
// CustomerDocumentAttachment table/security constants as the proven
// customer flow (see that file's own comment), via its own domain-neutral
// functions. This is deliberately NOT "the customer document flow" — no
// committedCustomerId, no draftId, no customer-review-payload semantics are
// touched — but it is also deliberately NOT a second attachment table, per
// the roadmap's "don't build a parallel attachment/upload system"
// invariant.
export const DOCUMENT_ATTACHMENT_MIME_TYPES = CUSTOMER_ATTACHMENT_MIME_TYPES;
export const DOCUMENT_ATTACHMENT_MAX_BYTES = CUSTOMER_ATTACHMENT_MAX_BYTES;
export const DOCUMENT_ATTACHMENT_TTL_MS = CUSTOMER_ATTACHMENT_TTL_MS;
const MAX_ACTIVE_ATTACHMENTS_PER_ACTOR = 20;

export type DocumentAttachmentOwner = { organizationId: string; actorId: string };
export type DocumentAttachmentReference = { attachmentRef: string; conversationId?: string; filename: string; mimeType: string; size: number; expiresAt: string };

export function validateDocumentAttachmentFile(file: Pick<File, "name" | "type" | "size">): void {
  if (!DOCUMENT_ATTACHMENT_MIME_TYPES.includes(file.type as (typeof DOCUMENT_ATTACHMENT_MIME_TYPES)[number])) throw new Error("ATTACHMENT_UNSUPPORTED_MIME");
  if (!file.size || file.size > DOCUMENT_ATTACHMENT_MAX_BYTES) throw new Error("ATTACHMENT_SIZE_INVALID");
}

export async function createDocumentAttachmentReference(input: DocumentAttachmentOwner & { conversationId?: string; file: File; now?: Date }): Promise<DocumentAttachmentReference> {
  validateDocumentAttachmentFile(input.file);
  const now = input.now ?? new Date();
  if (input.conversationId) {
    const conversation = await prisma.conversation.findFirst({ where: { id: input.conversationId, organizationId: input.organizationId, OR: [{ createdBy: input.actorId }, { createdBy: null }] }, select: { id: true } });
    if (!conversation) throw new Error("ATTACHMENT_CONVERSATION_NOT_FOUND");
  }
  await prisma.customerDocumentAttachment.deleteMany({ where: { organizationId: input.organizationId, actorUserId: input.actorId, expiresAt: { lte: now } } });
  const activeCount = await prisma.customerDocumentAttachment.count({ where: { organizationId: input.organizationId, actorUserId: input.actorId, expiresAt: { gt: now } } });
  if (activeCount >= MAX_ACTIVE_ATTACHMENTS_PER_ACTOR) throw new Error("ATTACHMENT_RATE_LIMITED");
  const content = Buffer.from(await input.file.arrayBuffer());
  assertFileSignatureMatchesDeclaredMime(content, input.file.type);
  const row = await prisma.customerDocumentAttachment.create({ data: { id: randomUUID(), organizationId: input.organizationId, actorUserId: input.actorId, conversationId: input.conversationId, filename: sanitizeCustomerAttachmentFilename(input.file.name), mimeType: input.file.type, sizeBytes: input.file.size, content, expiresAt: new Date(now.getTime() + DOCUMENT_ATTACHMENT_TTL_MS), extractionStatus: "READY", reviewStatus: "PENDING" } });
  return { attachmentRef: row.id, ...(row.conversationId ? { conversationId: row.conversationId } : {}), filename: row.filename, mimeType: row.mimeType, size: row.sizeBytes, expiresAt: row.expiresAt.toISOString() };
}

export async function resolveDocumentAttachment(input: DocumentAttachmentOwner & { attachmentRef: string; conversationId?: string; now?: Date }) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.attachmentRef)) throw new Error("ATTACHMENT_NOT_FOUND");
  const row = await prisma.customerDocumentAttachment.findFirst({ where: { id: input.attachmentRef, organizationId: input.organizationId, actorUserId: input.actorId } });
  if (!row) throw new Error("ATTACHMENT_NOT_FOUND");
  if (row.expiresAt.getTime() <= (input.now ?? new Date()).getTime()) { await prisma.customerDocumentAttachment.deleteMany({ where: { id: row.id, organizationId: input.organizationId, actorUserId: input.actorId } }); throw new Error("ATTACHMENT_EXPIRED"); }
  if (row.conversationId && input.conversationId !== undefined && input.conversationId !== row.conversationId) throw new Error("ATTACHMENT_CONVERSATION_MISMATCH");
  return row;
}

export async function bindDocumentAttachmentToConversation(input: DocumentAttachmentOwner & { attachmentRef: string; conversationId: string }) {
  const row = await resolveDocumentAttachment({ ...input });
  if (row.conversationId && row.conversationId !== input.conversationId) throw new Error("ATTACHMENT_CONVERSATION_MISMATCH");
  const conversation = await prisma.conversation.findFirst({ where: { id: input.conversationId, organizationId: input.organizationId, OR: [{ createdBy: input.actorId }, { createdBy: null }] }, select: { id: true } });
  if (!conversation) throw new Error("ATTACHMENT_CONVERSATION_NOT_FOUND");
  return prisma.customerDocumentAttachment.update({ where: { id: row.id, organizationId: input.organizationId }, data: { conversationId: input.conversationId } });
}

export async function deleteDocumentAttachment(input: DocumentAttachmentOwner & { attachmentRef: string }) {
  await prisma.customerDocumentAttachment.deleteMany({ where: { id: input.attachmentRef, organizationId: input.organizationId, actorUserId: input.actorId } });
}

export function mapDocumentAttachmentError(error: unknown): { message: string; status: number } | null {
  const code = error instanceof Error ? error.message : "";
  if (code === "ATTACHMENT_UNSUPPORTED_MIME") return { message: "Desteklenen biçimler JPEG, PNG, WebP ve PDF'dir.", status: 415 };
  if (code === "ATTACHMENT_CONTENT_MIME_MISMATCH") return { message: "Dosya içeriği bildirilen biçimle eşleşmiyor.", status: 415 };
  if (code === "ATTACHMENT_SIZE_INVALID") return { message: "Dosya 10 MB sınırını aşıyor veya boş.", status: 413 };
  if (code === "ATTACHMENT_EXPIRED") return { message: "Belge oturumunun süresi doldu. Dosyayı yeniden yükleyin.", status: 410 };
  if (["ATTACHMENT_NOT_FOUND", "ATTACHMENT_CONVERSATION_MISMATCH", "ATTACHMENT_CONVERSATION_NOT_FOUND"].includes(code)) return { message: "Belge bu oturumda bulunamadı veya erişilemiyor.", status: 404 };
  if (code === "ATTACHMENT_RATE_LIMITED") return { message: "Çok fazla aktif belge var. Daha sonra tekrar deneyin.", status: 429 };
  if (code === "ATTACHMENT_ALREADY_CLASSIFIED") return { message: "Belge zaten sınıflandırıldı.", status: 409 };
  if (code === "ATTACHMENT_NOT_CLASSIFIED") return { message: "Belge önce sınıflandırılmalı.", status: 409 };
  if (code === "ATTACHMENT_ALREADY_EXTRACTED") return { message: "Belge zaten işlendi.", status: 409 };
  if (code === "ATTACHMENT_DOMAIN_UNSUPPORTED") return { message: "Bu belge türü için otomatik alan çıkarımı desteklenmiyor.", status: 422 };
  return null;
}
