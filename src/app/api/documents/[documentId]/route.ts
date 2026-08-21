import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { archiveDocument, findDocumentById } from "@/lib/core/documents";

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }): Promise<Response> {
  try {
    const [authContext, { documentId }] = await Promise.all([requireAuthContextFromCookies(), context.params]);
    const document = await findDocumentById(documentId, authContext.organization.id);
    if (!document) return fail("Belge bulunamadı.", 404);
    return ok({ document });
  } catch (error: unknown) {
    return authFail(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ documentId: string }> }): Promise<Response> {
  try {
    const [authContext, { documentId }] = await Promise.all([requireAuthContextFromCookies(), context.params]);
    const document = await archiveDocument(documentId, authContext.organization.id);
    if (!document) return fail("Belge bulunamadı.", 404);
    return ok({ document });
  } catch (error: unknown) {
    return authFail(error);
  }
}
