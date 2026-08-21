import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { createNewDocument, listDocuments, mapDocumentError, sanitizeDocumentFilename, validateDocumentFile } from "@/lib/core/documents";
import type { DocumentStatus } from "@prisma/client";

const DOCUMENT_STATUSES = ["ACTIVE", "ARCHIVED", "SUPERSEDED"] as const satisfies readonly DocumentStatus[];

export async function GET(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const url = new URL(request.url);
    const relatedEntityType = url.searchParams.get("relatedEntityType") ?? undefined;
    const relatedEntityId = url.searchParams.get("relatedEntityId") ?? undefined;
    const rawStatus = url.searchParams.get("status") ?? undefined;
    if (rawStatus !== undefined && !(DOCUMENT_STATUSES as readonly string[]).includes(rawStatus)) return fail("status is invalid.", 400);

    const documents = await listDocuments({
      organizationId: authContext.organization.id,
      relatedEntityType,
      relatedEntityId,
      status: rawStatus as DocumentStatus | undefined,
    });

    return ok({ documents, count: documents.length });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 11 * 1024 * 1024) return fail("Dosya 10 MB sınırını aşıyor.", 413);

    const form = await request.formData();
    const file = form.get("file");
    const relatedEntityType = form.get("relatedEntityType");
    const relatedEntityId = form.get("relatedEntityId");
    const documentType = form.get("documentType");
    if (!(file instanceof File)) return fail("file is required.", 400);
    if (typeof relatedEntityType !== "string" || !relatedEntityType.trim()) return fail("relatedEntityType is required.", 400);
    if (typeof relatedEntityId !== "string" || !relatedEntityId.trim()) return fail("relatedEntityId is required.", 400);
    if (documentType !== null && typeof documentType !== "string") return fail("documentType is invalid.", 400);

    validateDocumentFile(file);
    const document = await createNewDocument({
      organizationId: authContext.organization.id,
      uploadedByUserId: authContext.user.id,
      filename: sanitizeDocumentFilename(file.name),
      mimeType: file.type,
      sizeBytes: file.size,
      content: Buffer.from(await file.arrayBuffer()),
      relatedEntityType: relatedEntityType.trim(),
      relatedEntityId: relatedEntityId.trim(),
      ...(documentType ? { documentType } : {}),
    });

    return ok({ document });
  } catch (error: unknown) {
    const mapped = mapDocumentError(error);
    return mapped ? fail(mapped.message, mapped.status) : authFail(error);
  }
}
