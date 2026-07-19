import { randomUUID } from "crypto";
import { prisma } from "@/lib/core/shared/prisma";

export const CUSTOMER_ATTACHMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const CUSTOMER_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CUSTOMER_ATTACHMENT_TTL_MS = 30 * 60_000;
const MAX_ACTIVE_ATTACHMENTS_PER_ACTOR = 20;

export type CustomerAttachmentOwner = { organizationId: string; actorId: string };
export type CustomerAttachmentReference = { attachmentRef: string; conversationId?: string; filename: string; mimeType: string; size: number; expiresAt: string };

export function sanitizeCustomerAttachmentFilename(value: string): string {
  const name = value.normalize("NFKC").replace(/[\\/\0\r\n]/g, "_").replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 120);
  return name && name !== "." && name !== ".." ? name : "document";
}

export function validateCustomerAttachmentFile(file: Pick<File, "name" | "type" | "size">): void {
  if (!CUSTOMER_ATTACHMENT_MIME_TYPES.includes(file.type as (typeof CUSTOMER_ATTACHMENT_MIME_TYPES)[number])) throw new Error("ATTACHMENT_UNSUPPORTED_MIME");
  if (!file.size || file.size > CUSTOMER_ATTACHMENT_MAX_BYTES) throw new Error("ATTACHMENT_SIZE_INVALID");
}

export async function createCustomerAttachmentReference(input: CustomerAttachmentOwner & { conversationId?: string; file: File; now?: Date }): Promise<CustomerAttachmentReference> {
  validateCustomerAttachmentFile(input.file);
  const now = input.now ?? new Date();
  if (input.conversationId) {
    const conversation = await prisma.conversation.findFirst({ where: { id: input.conversationId, organizationId: input.organizationId, OR: [{ createdBy: input.actorId }, { createdBy: null }] }, select: { id: true } });
    if (!conversation) throw new Error("ATTACHMENT_CONVERSATION_NOT_FOUND");
  }
  await prisma.customerDocumentAttachment.deleteMany({ where: { expiresAt: { lte: now } } });
  const activeCount = await prisma.customerDocumentAttachment.count({ where: { organizationId: input.organizationId, actorUserId: input.actorId, expiresAt: { gt: now } } });
  if (activeCount >= MAX_ACTIVE_ATTACHMENTS_PER_ACTOR) throw new Error("ATTACHMENT_RATE_LIMITED");
  const row = await prisma.customerDocumentAttachment.create({ data: { id: randomUUID(), organizationId: input.organizationId, actorUserId: input.actorId, conversationId: input.conversationId, filename: sanitizeCustomerAttachmentFilename(input.file.name), mimeType: input.file.type, sizeBytes: input.file.size, content: Buffer.from(await input.file.arrayBuffer()), expiresAt: new Date(now.getTime() + CUSTOMER_ATTACHMENT_TTL_MS) } });
  return { attachmentRef: row.id, ...(row.conversationId ? { conversationId: row.conversationId } : {}), filename: row.filename, mimeType: row.mimeType, size: row.sizeBytes, expiresAt: row.expiresAt.toISOString() };
}

export async function resolveCustomerAttachment(input: CustomerAttachmentOwner & { attachmentRef: string; conversationId?: string; now?: Date }) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.attachmentRef)) throw new Error("ATTACHMENT_NOT_FOUND");
  const row = await prisma.customerDocumentAttachment.findFirst({ where: { id: input.attachmentRef, organizationId: input.organizationId, actorUserId: input.actorId }, select: { id: true, organizationId: true, actorUserId: true, conversationId: true, filename: true, mimeType: true, sizeBytes: true, content: true, expiresAt: true, extractionStatus: true, extractionRequestId: true, extractionPayload: true } });
  if (!row) throw new Error("ATTACHMENT_NOT_FOUND");
  if (row.expiresAt.getTime() <= (input.now ?? new Date()).getTime()) { await prisma.customerDocumentAttachment.deleteMany({ where: { id: row.id, organizationId: input.organizationId, actorUserId: input.actorId } }); throw new Error("ATTACHMENT_EXPIRED"); }
  if (row.conversationId && input.conversationId !== row.conversationId) throw new Error("ATTACHMENT_CONVERSATION_MISMATCH");
  return row;
}

export async function bindCustomerAttachmentToConversation(input: CustomerAttachmentOwner & { attachmentRef: string; conversationId: string }) {
  const row = await resolveCustomerAttachment({ ...input });
  if (row.conversationId && row.conversationId !== input.conversationId) throw new Error("ATTACHMENT_CONVERSATION_MISMATCH");
  const conversation = await prisma.conversation.findFirst({ where: { id: input.conversationId, organizationId: input.organizationId, OR: [{ createdBy: input.actorId }, { createdBy: null }] }, select: { id: true } });
  if (!conversation) throw new Error("ATTACHMENT_CONVERSATION_NOT_FOUND");
  return prisma.customerDocumentAttachment.update({ where: { id: row.id }, data: { conversationId: input.conversationId } });
}

export async function deleteCustomerAttachment(input: CustomerAttachmentOwner & { attachmentRef: string }) {
  await prisma.customerDocumentAttachment.deleteMany({ where: { id: input.attachmentRef, organizationId: input.organizationId, actorUserId: input.actorId } });
}

export function mapCustomerAttachmentError(error: unknown): { message: string; status: number } | null {
  const code = error instanceof Error ? error.message : "";
  if (code === "ATTACHMENT_UNSUPPORTED_MIME") return { message: "Desteklenen biçimler JPEG, PNG, WebP ve PDF'dir.", status: 415 };
  if (code === "ATTACHMENT_SIZE_INVALID") return { message: "Dosya 10 MB sınırını aşıyor veya boş.", status: 413 };
  if (code === "ATTACHMENT_EXPIRED") return { message: "Belge oturumunun süresi doldu. Dosyayı yeniden yükleyin.", status: 410 };
  if (["ATTACHMENT_NOT_FOUND", "ATTACHMENT_CONVERSATION_MISMATCH", "ATTACHMENT_CONVERSATION_NOT_FOUND"].includes(code)) return { message: "Belge bu oturumda bulunamadı veya erişilemiyor.", status: 404 };
  if (code === "ATTACHMENT_RATE_LIMITED") return { message: "Çok fazla aktif belge var. Daha sonra tekrar deneyin.", status: 429 };
  return null;
}
