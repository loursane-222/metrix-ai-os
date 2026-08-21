import { describe, expect, it, vi, beforeEach } from "vitest";

import { ApiValidationError } from "@/lib/api/validation";

const { createDocumentMock, listDocumentsForOrganizationMock, archiveDocumentRecordMock } = vi.hoisted(() => ({
  createDocumentMock: vi.fn(),
  listDocumentsForOrganizationMock: vi.fn(),
  archiveDocumentRecordMock: vi.fn(),
}));

vi.mock("../document.repository", () => ({
  createDocument: createDocumentMock,
  listDocumentsForOrganization: listDocumentsForOrganizationMock,
  findDocumentMetadataById: vi.fn(),
  findDocumentWithContentById: vi.fn(),
  archiveDocumentRecord: archiveDocumentRecordMock,
}));

import { archiveDocument, createNewDocument, listDocuments, sanitizeDocumentFilename, validateDocumentFile } from "../document.service";

const validFile = { name: "vergi-levhasi.pdf", type: "application/pdf", size: 1024 };

describe("document.service", () => {
  beforeEach(() => {
    createDocumentMock.mockReset();
    listDocumentsForOrganizationMock.mockReset();
    archiveDocumentRecordMock.mockReset();
  });

  it("rejects an unsupported MIME type", () => {
    expect(() => validateDocumentFile({ name: "x.exe", type: "application/x-msdownload", size: 100 })).toThrow("DOCUMENT_UNSUPPORTED_MIME");
  });

  it("rejects an oversized or empty file", () => {
    expect(() => validateDocumentFile({ ...validFile, size: 11 * 1024 * 1024 })).toThrow("DOCUMENT_SIZE_INVALID");
    expect(() => validateDocumentFile({ ...validFile, size: 0 })).toThrow("DOCUMENT_SIZE_INVALID");
  });

  it("accepts a supported, correctly-sized file", () => {
    expect(() => validateDocumentFile(validFile)).not.toThrow();
  });

  it("sanitizes unsafe characters out of a filename", () => {
    expect(sanitizeDocumentFilename("../../etc/passwd")).not.toContain("/");
    expect(sanitizeDocumentFilename("rapor*?.pdf")).toBe("rapor__.pdf");
  });

  it("rejects a document missing relatedEntityType or relatedEntityId", async () => {
    await expect(createNewDocument({
      organizationId: "org-1", uploadedByUserId: "user-1", filename: "f.pdf", mimeType: "application/pdf",
      sizeBytes: 100, content: Buffer.alloc(1) as Buffer<ArrayBuffer>, relatedEntityType: "", relatedEntityId: "customer-1",
    })).rejects.toThrow(ApiValidationError);
    expect(createDocumentMock).not.toHaveBeenCalled();
  });

  it("creates a document tied to a real entity", async () => {
    createDocumentMock.mockResolvedValue({ id: "d-1", relatedEntityType: "Customer", relatedEntityId: "customer-1" });

    const result = await createNewDocument({
      organizationId: "org-1", uploadedByUserId: "user-1", filename: "vergi-levhasi.pdf", mimeType: "application/pdf",
      sizeBytes: 1024, content: Buffer.alloc(1) as Buffer<ArrayBuffer>, relatedEntityType: "Customer", relatedEntityId: "customer-1",
    });

    expect(result.id).toBe("d-1");
    expect(createDocumentMock).toHaveBeenCalledWith(expect.objectContaining({ relatedEntityType: "Customer", relatedEntityId: "customer-1" }));
  });

  it("lists documents for an organization, optionally filtered to a related entity", async () => {
    listDocumentsForOrganizationMock.mockResolvedValue([{ id: "d-1" }]);

    const result = await listDocuments({ organizationId: "org-1", relatedEntityType: "Customer", relatedEntityId: "customer-1" });

    expect(result).toHaveLength(1);
    expect(listDocumentsForOrganizationMock).toHaveBeenCalledWith({ organizationId: "org-1", relatedEntityType: "Customer", relatedEntityId: "customer-1" });
  });

  it("archives a document instead of hard-deleting it (lifecycle, not disposal)", async () => {
    archiveDocumentRecordMock.mockResolvedValue({ id: "d-1", status: "ARCHIVED" });

    const result = await archiveDocument("d-1", "org-1");

    expect(result).toEqual({ id: "d-1", status: "ARCHIVED" });
    expect(archiveDocumentRecordMock).toHaveBeenCalledWith("d-1", "org-1");
  });
});
