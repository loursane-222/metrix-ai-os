import { fail, ok } from "@/lib/api/response";
import { requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { AuthError } from "@/lib/auth/shared/auth.errors";
import { parseSpreadsheetFile, UnsupportedSpreadsheetFileError } from "@/lib/imports/spreadsheet-parser";
import { previewOrderImport } from "@/lib/imports/order-import.service";
import { hashFileContent, findPriorFileImport } from "@/lib/imports/file-fingerprint";

const ALLOWED_EXTENSIONS = [".xlsx", ".csv"];

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireAuthContextFromCookies();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 11 * 1024 * 1024) return fail("Dosya 10 MB sınırını aşıyor.", 413);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("file is required.", 400);
    if (!ALLOWED_EXTENSIONS.some((extension) => file.name.toLocaleLowerCase("tr-TR").endsWith(extension))) {
      return fail("Yalnızca .xlsx veya .csv dosyaları desteklenir.", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { headers, rows } = await parseSpreadsheetFile(buffer, file.name);
    if (!headers.length) return fail("Dosyada okunabilir bir başlık satırı bulunamadı.", 400);

    const preview = await previewOrderImport({ organizationId: auth.organization.id, headers, rows });
    const fileHash = hashFileContent(buffer);
    const priorImportAt = await findPriorFileImport(auth.organization.id, "Order", fileHash);
    return ok({ ...preview, fileHash, priorImportAt });
  } catch (error) {
    if (error instanceof UnsupportedSpreadsheetFileError) return fail(error.message, 400);
    if (error instanceof AuthError) return fail(error.message, error.status);
    console.error("[order_import_parse] failed", { errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return fail("Dosya işlenemedi.", 500);
  }
}
