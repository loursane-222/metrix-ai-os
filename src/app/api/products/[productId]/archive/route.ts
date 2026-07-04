import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { archiveProductServiceById } from "@/lib/core/products/product.service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ productId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { productId } = await context.params;

    await archiveProductServiceById(productId, authContext.organization.id);

    return ok({ archived: true });
  } catch (error: unknown) {
    return authFail(error);
  }
}
