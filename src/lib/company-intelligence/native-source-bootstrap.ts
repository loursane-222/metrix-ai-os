import { getConnectorAdapter, registerConnectorAdapter } from "./connector-gateway";
import { ingestExternalRecord, type IngestExternalRecordOutcome } from "./identity-graph";
import { nativeConnectorAdapter } from "./native-connector-adapter";
import { registerSource } from "./source-registry";
import type { ConnectorSourceDescriptor } from "./types";

const NATIVE_SOURCE_KEY = "metrix-native";

/**
 * Idempotent upsert (see registerSource) — safe to call on every request
 * that needs the native source row rather than requiring a one-time setup
 * step per organization. This is exactly the "bootstrap mümkün olduğunca
 * otomatik/deterministic olsun" requirement: no manual per-org provisioning.
 */
export async function ensureNativeSourceRegistered(organizationId: string): Promise<ConnectorSourceDescriptor> {
  return registerSource({
    organizationId,
    sourceKey: NATIVE_SOURCE_KEY,
    sourceType: "METRIX_NATIVE",
    provider: "METRIX",
    displayName: "METRIX Native",
    connectionMode: "NATIVE",
    capabilities: [
      { id: "customer.profile", read: true, write: false },
      { id: "calendar.events", read: true, write: false },
    ],
    // METRIX is always the anchor system of record for its own customer
    // profile — declared PRIMARY unconditionally so a fresh organization
    // resolves without needing any authority configuration at all.
    // calendar.events deliberately has NO authoritativeScopes entry: unlike
    // customer.profile (one winner), calendar is federated/additive across
    // sources (see calendar-projection.ts) — there is no single "authority"
    // to declare, so Truth Authority's PRIMARY/SECONDARY concept is not
    // used for it at all; the projection function queries every capable,
    // healthy source directly instead.
    authoritativeScopes: [{ factScope: "customer.profile", role: "PRIMARY", applicability: "READ" }],
    status: "ACTIVE",
  });
}

/** Registers the adapter instance once per process — mirrors bootstrapCapabilityRegistry's own idempotency guard. */
export function ensureNativeConnectorAdapterRegistered(): void {
  if (!getConnectorAdapter("METRIX")) registerConnectorAdapter(nativeConnectorAdapter);
}

/**
 * Links one native customer into the Identity Graph, minting a new
 * canonical entity the first time this customer is referenced (or joining
 * one an earlier-ingested source already created for the same real
 * business, via identity-graph.ts's normalized-name tier). Idempotent per
 * (organization, customerId) — this is the "her mevcut müşteriyi elle
 * identity mapping'e taşımak gerekmiyor" bootstrap: it runs just-in-time,
 * on first reference, not as a bulk migration.
 */
export async function resolveNativeCustomerIdentity(organizationId: string, customerId: string, displayName: string): Promise<IngestExternalRecordOutcome> {
  ensureNativeConnectorAdapterRegistered();
  const source = await ensureNativeSourceRegistered(organizationId);
  return ingestExternalRecord({
    organizationId,
    entityType: "customer",
    sourceId: source.id,
    externalEntityId: customerId,
    externalDisplayName: displayName,
  });
}
