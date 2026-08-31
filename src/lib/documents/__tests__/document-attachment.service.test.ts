import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ conversation: { findFirst: vi.fn() }, customerDocumentAttachment: { deleteMany: vi.fn(), count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: db }));
import { createDocumentAttachmentReference, resolveDocumentAttachment, validateDocumentAttachmentFile } from "../document-attachment.service";

describe("document attachment authority (Phase 14 — same CustomerDocumentAttachment table, generic access functions)", () => {
  beforeEach(() => { vi.clearAllMocks(); db.customerDocumentAttachment.deleteMany.mockResolvedValue({ count: 0 }); db.customerDocumentAttachment.count.mockResolvedValue(0); });

  it("enforces MIME allowlist and size limit", () => {
    expect(() => validateDocumentAttachmentFile({ name: "x.exe", type: "application/x-msdownload", size: 2 })).toThrow("ATTACHMENT_UNSUPPORTED_MIME");
    expect(() => validateDocumentAttachmentFile({ name: "x.pdf", type: "application/pdf", size: 11 * 1024 * 1024 })).toThrow("ATTACHMENT_SIZE_INVALID");
  });

  it("rejects content whose real bytes don't match the declared MIME even when the MIME itself is allowlisted", async () => {
    db.customerDocumentAttachment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, conversationId: null }));
    await expect(createDocumentAttachmentReference({ organizationId: "org-1", actorId: "actor-1", file: new File(["not actually a pdf"], "f.pdf", { type: "application/pdf" }) }))
      .rejects.toThrow("ATTACHMENT_CONTENT_MIME_MISMATCH");
    expect(db.customerDocumentAttachment.create).not.toHaveBeenCalled();
  });

  it("creates a reference when content genuinely matches the declared MIME", async () => {
    db.customerDocumentAttachment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, conversationId: null }));
    const now = new Date("2026-09-01T00:00:00Z");
    const result = await createDocumentAttachmentReference({ organizationId: "org-1", actorId: "actor-1", file: new File(["%PDF-1.7\n"], "fatura.pdf", { type: "application/pdf" }), now });
    expect(result.attachmentRef).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(result.expiresAt).getTime() - now.getTime()).toBe(30 * 60_000);
  });

  it("rejects a cross-tenant attachment reference (never leaks existence across organizations)", async () => {
    db.customerDocumentAttachment.findFirst.mockResolvedValueOnce(null);
    await expect(resolveDocumentAttachment({ organizationId: "org-other", actorId: "actor-1", attachmentRef: "11111111-1111-1111-1111-111111111111" })).rejects.toThrow("ATTACHMENT_NOT_FOUND");
  });

  it("expires and deletes an owned row once past expiresAt rather than serving stale content", async () => {
    db.customerDocumentAttachment.findFirst.mockResolvedValueOnce({ id: "11111111-1111-1111-1111-111111111111", conversationId: null, expiresAt: new Date(0) });
    await expect(resolveDocumentAttachment({ organizationId: "org-1", actorId: "actor-1", attachmentRef: "11111111-1111-1111-1111-111111111111" })).rejects.toThrow("ATTACHMENT_EXPIRED");
    expect(db.customerDocumentAttachment.deleteMany).toHaveBeenCalled();
  });

  it("rejects an attachment bound to a different conversation", async () => {
    db.customerDocumentAttachment.findFirst.mockResolvedValue({ id: "11111111-1111-1111-1111-111111111111", conversationId: "conversation-1", expiresAt: new Date("2099-01-01") });
    await expect(resolveDocumentAttachment({ organizationId: "org-1", actorId: "actor-1", attachmentRef: "11111111-1111-1111-1111-111111111111", conversationId: "conversation-2" })).rejects.toThrow("ATTACHMENT_CONVERSATION_MISMATCH");
  });
});
