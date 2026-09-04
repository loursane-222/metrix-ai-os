import { bootstrapCapabilityRegistry } from "@/lib/canonical-operation/capabilities";
import { getCapability } from "@/lib/canonical-operation/capability-registry";
import type { ConnectorAdapter, ConnectorReadRequest, ConnectorReadResult, ConnectorSourceHealth } from "./types";

/**
 * Maps a Company Intelligence fact scope onto the existing, already-real
 * canonical-operation READ capability that serves it. Only "customer.profile"
 * is wired in this operation (native IS the system of record for the
 * customer entity itself — see native-source-bootstrap.ts's authoritative
 * scope declaration); a future fact scope backed by another native READ
 * capability is one more entry here, never a new read path.
 */
const FACT_SCOPE_TO_NATIVE_CAPABILITY: Record<string, string> = {
  "customer.profile": "customer.read",
  // Backs the unified Canonical Calendar Projection (calendar-projection.ts)
  // — native is one of the calendar sources it federates, through this same
  // seam, not a special-cased direct Prisma/service call.
  "calendar.events": "calendar.read",
};

/**
 * Adapts the existing, production-locked capability-registry/
 * executeCanonicalOperation layer to the ConnectorAdapter contract — this
 * is METRIX's own business truth, registered as the first real source, not
 * a reimplementation of it. Read-only: this operation's write routing
 * (write-routing.ts) calls executeCanonicalOperation directly for the
 * native source rather than through this adapter's (absent) write, so
 * there is exactly one write path into METRIX's own data — see
 * write-routing.ts's own doc comment.
 */
export const nativeConnectorAdapter: ConnectorAdapter = {
  provider: "METRIX",
  displayName: "METRIX Native",
  supportedCapabilities: Object.keys(FACT_SCOPE_TO_NATIVE_CAPABILITY),

  async health(): Promise<ConnectorSourceHealth> {
    return { status: "HEALTHY", checkedAt: new Date().toISOString() };
  },

  async read(request: ConnectorReadRequest): Promise<ConnectorReadResult> {
    const observedAt = new Date().toISOString();
    const capabilityId = FACT_SCOPE_TO_NATIVE_CAPABILITY[request.factScope];
    if (!capabilityId) return { status: "UNSUPPORTED", observedAt };

    bootstrapCapabilityRegistry();
    const descriptor = getCapability(capabilityId);
    if (!descriptor || descriptor.implementation.kind !== "READ") return { status: "UNSUPPORTED", observedAt };

    if (request.externalEntityId) {
      const value = await descriptor.implementation.read(request.organizationId, request.externalEntityId);
      if (!value) return { status: "NOT_FOUND", observedAt };
      return { status: "OK", value, observedAt };
    }

    // No entity id — a search-style request (e.g. calendar.events' range
    // query). Generic: any capability with a `search` implementation gets
    // this for free, not a calendar-specific branch.
    if (!descriptor.implementation.search) return { status: "UNSUPPORTED", observedAt };
    const value = await descriptor.implementation.search(request.organizationId, (request.params ?? {}) as Record<string, unknown>);
    return { status: "OK", value, observedAt };
  },
};
