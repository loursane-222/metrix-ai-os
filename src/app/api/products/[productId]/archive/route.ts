import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { archiveProductServiceById } from "@/lib/core/products/product.service";
import { authorizeLegacyMutation } from "@/lib/action-runtime/gateway/legacy-mutation-security";

export async function POST(
  _request: Request,
  context: { params: Promise<{ productId: string }> },
): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    const { productId } = await context.params;
    const security = authorizeLegacyMutation({ authContext, actionName: "product.archive", requiredPermission: "products.archive", entityType: "ProductService", entityId: productId });

    await archiveProductServiceById(productId, authContext.organization.id);
    security.succeed();

    return ok({ archived: true });
  } catch (error: unknown) {
    return authFail(error);
  }
}
