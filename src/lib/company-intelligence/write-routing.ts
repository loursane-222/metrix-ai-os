import { executeCanonicalOperation, type ExecuteCanonicalOperationDeps } from "@/lib/canonical-operation/native-connector";
import type { CanonicalOperationResultV1, CanonicalOperationV1 } from "@/lib/canonical-operation/types";
import { getSourceById } from "./source-registry";
import { resolveTruthAuthority } from "./truth-authority";

export type WriteRouteResolution =
  | { readonly status: "ROUTE_NATIVE" }
  | { readonly status: "ROUTE_UNSUPPORTED_CONNECTOR"; readonly sourceId: string; readonly provider: string }
  | { readonly status: "NO_AUTHORITY" }
  | { readonly status: "CONFLICT"; readonly candidateSourceIds: readonly string[] };

/**
 * Resolves which connector is authoritative to execute a WRITE for a fact
 * scope, deterministically (via truth-authority.ts, same as READ). A
 * resolved non-native source never silently falls back to native or to any
 * other connector — see ROUTE_UNSUPPORTED_CONNECTOR — since no real
 * non-native write adapter is implemented in this operation (rule 15,
 * "unsupported capability fallback" is forbidden).
 */
export async function resolveWriteRoute(params: { readonly organizationId: string; readonly factScope: string }): Promise<WriteRouteResolution> {
  const authority = await resolveTruthAuthority({ organizationId: params.organizationId, factScope: params.factScope, applicability: "WRITE" });
  if (authority.status === "CONFLICT") return { status: "CONFLICT", candidateSourceIds: authority.candidateSourceIds };
  if (authority.status === "UNCONFIGURED_NO_SOURCE" || authority.status === "SOURCE_UNAVAILABLE") return { status: "NO_AUTHORITY" };

  const sourceId = authority.status === "RESOLVED" ? authority.primarySourceId : authority.sourceId;
  const source = await getSourceById(params.organizationId, sourceId);
  if (!source) return { status: "NO_AUTHORITY" };
  if (source.provider === "METRIX") return { status: "ROUTE_NATIVE" };
  return { status: "ROUTE_UNSUPPORTED_CONNECTOR", sourceId: source.id, provider: source.provider };
}

/**
 * ONE WRITE AUTHORITY: the native route delegates straight to
 * executeCanonicalOperation — the same, already policy/approval/
 * idempotency/readback/audit-wired path every other native write already
 * goes through. This function adds no execution logic of its own; it only
 * guards that a caller checked resolveWriteRoute's result first, so a
 * ROUTE_UNSUPPORTED_CONNECTOR/NO_AUTHORITY/CONFLICT route can never reach
 * an execution call by accident.
 */
export async function executeRoutedWrite(
  operation: CanonicalOperationV1,
  deps: ExecuteCanonicalOperationDeps,
  route: WriteRouteResolution,
): Promise<CanonicalOperationResultV1> {
  if (route.status !== "ROUTE_NATIVE") {
    throw new Error(`executeRoutedWrite called with a non-native route ("${route.status}"); callers must branch on resolveWriteRoute's result before calling this.`);
  }
  return executeCanonicalOperation(operation, deps);
}
