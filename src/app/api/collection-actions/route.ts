import { ok } from "@/lib/api/response";
import { authFail, requireAuthContextFromCookies } from "@/lib/auth/guards/api-auth-guard";
import { syncAiCollectionActions } from "@/lib/core/collection-actions/collection-action-sync.service";
import { listActiveCollectionActionsForOrganization } from "@/lib/core/collection-actions/collection-action.repository";

export async function GET(): Promise<Response> {
  try {
    const authContext = await requireAuthContextFromCookies();
    await syncAiCollectionActions(authContext.organization.id);
    const collectionActions = await listActiveCollectionActionsForOrganization(authContext.organization.id);
    return ok({ collectionActions, count: collectionActions.length });
  } catch (error: unknown) {
    return authFail(error);
  }
}
