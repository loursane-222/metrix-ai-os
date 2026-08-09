import { fail, ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { ApiValidationError, optionalString, readJsonObject } from "@/lib/api/validation";
import { listPendingInventoryVariances, recordPhysicalCount } from "@/lib/core/stock/stock-intelligence.service";

export async function GET() {
  try {
    const auth = await requireAuthContextFromCookies();
    const records = await listPendingInventoryVariances(auth.organization.id);
    return ok({ records, count: records.length });
  } catch (error) {
    return authFail(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthContextFromCookies();
    const body = await readJsonObject(request);
    const stockId = optionalString(body, "stockId");
    if (!stockId || typeof body.countedQuantity !== "number") return fail("stockId and countedQuantity are required.", 400);
    const record = await recordPhysicalCount(stockId, auth.organization.id, body.countedQuantity, optionalString(body, "note"), auth.user.id);
    return ok({ record }, 201);
  } catch (error) {
    if (error instanceof ApiValidationError) return fail(error.message, 400);
    return authFail(error);
  }
}
