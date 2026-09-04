/**
 * Multi-System Company Intelligence + Connector Platform (Büyük Operasyon 2).
 *
 * This does NOT replace src/lib/canonical-operation (CanonicalOperationV1/
 * executeCanonicalOperation remains the one write authority and the read
 * path for METRIX's own data) or src/lib/company-query-authority (cross-
 * domain composition within METRIX's own data). This is the layer ABOVE
 * both of those: it lets the same canonical entity be known to more than
 * one connected business system, decides — deterministically, never by
 * guessing — which system's answer for a given fact is the truth, and
 * carries where that answer came from all the way to the caller. In this
 * operation METRIX itself (via native-connector-adapter.ts, wrapping the
 * existing canonical-operation layer) is the only real source; everything
 * here is written so a second real source is a new adapter, not a new
 * architecture.
 */

// Known values for editor/autocomplete convenience; the `(string & {})`
// member keeps both genuinely open — a new vendor or a test fixture (e.g.
// "ACCOUNTING_FAKE") never needs a type change here, only a new
// ConnectorSource row and a registered ConnectorAdapter for it. This is the
// "genişletilebilir contract" the operation asked for, not raw `string`
// scattered through every call site.
export type ConnectorSourceType =
  | "METRIX_NATIVE"
  | "ACCOUNTING"
  | "CRM"
  | "ERP"
  | "EMAIL"
  | "CALENDAR"
  | "HR"
  | "ECOMMERCE"
  | "BANKING"
  | (string & {});

export type ConnectorProvider =
  | "METRIX"
  | "LOGO"
  | "NETSIS"
  | "PARASUT"
  | "HUBSPOT"
  | "GOOGLE"
  | "ICLOUD"
  | "MICROSOFT"
  | (string & {});

export type ConnectorSourceStatus = "ACTIVE" | "DISABLED" | "ERROR" | "PENDING";
export type ConnectorConnectionMode = "NATIVE" | "API" | "OAUTH" | "MANUAL" | "TEST";

/**
 * One capability a source claims to serve, at the fact-scope granularity
 * Truth Authority and the Connector Gateway both key off (e.g.
 * "customer.profile", "customer.accountingBalance") — deliberately not the
 * same id space as canonical-operation's action-runtime-backed capability
 * ids (e.g. "customer.update"), since a fact scope here can be served by a
 * source that has no write action of its own at all (a CRM's pipeline, an
 * ERP's stock position).
 */
export type ConnectorCapabilityDescriptor = {
  readonly id: string;
  readonly read: boolean;
  readonly write: boolean;
};

/**
 * A source's own declared claim to be the truth for a fact scope. This is
 * NOT the resolution itself — see truth-authority.ts's resolveTruthAuthority
 * — it is only the input Truth Authority resolves deterministically, so two
 * misconfigured PRIMARY claims for the same scope surface as CONFLICT rather
 * than a silent pick.
 */
export type AuthoritativeScopeRule = {
  readonly factScope: string;
  readonly role: "PRIMARY" | "SECONDARY";
  readonly applicability: "READ" | "WRITE" | "BOTH";
  readonly priority?: number;
};

export type ConnectorSourceHealth = {
  readonly status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  readonly checkedAt: string;
  readonly detail?: string;
};

/** The Source Registry row — see source-registry.ts. */
export type ConnectorSourceDescriptor = {
  readonly id: string;
  readonly organizationId: string;
  readonly sourceKey: string;
  readonly sourceType: ConnectorSourceType;
  readonly provider: ConnectorProvider;
  readonly displayName: string;
  readonly status: ConnectorSourceStatus;
  readonly connectionMode: ConnectorConnectionMode;
  readonly capabilities: readonly ConnectorCapabilityDescriptor[];
  readonly authoritativeScopes: readonly AuthoritativeScopeRule[];
  readonly health: ConnectorSourceHealth | null;
  readonly lastObservedAt: string | null;
  readonly lastSuccessfulSyncAt: string | null;
  readonly metadata: Record<string, unknown> | null;
};

// ---------------------------------------------------------------------------
// Identity Graph
// ---------------------------------------------------------------------------

export type CanonicalEntityStatus = "ACTIVE" | "ARCHIVED";

export type CanonicalEntityDescriptor = {
  readonly canonicalEntityId: string;
  readonly organizationId: string;
  readonly entityType: string;
  readonly canonicalDisplayName: string;
  readonly status: CanonicalEntityStatus;
};

export type ExternalIdentityMatchMethod =
  | "EXPLICIT_MAPPING"
  | "DETERMINISTIC_IDENTIFIER"
  | "EXACT_NORMALIZED_NAME"
  | "NEW_CANONICAL_MINTED";

export type ExternalEntityIdentityDescriptor = {
  readonly id: string;
  readonly organizationId: string;
  readonly canonicalEntityId: string;
  readonly sourceId: string;
  readonly externalEntityType: string;
  readonly externalEntityId: string;
  readonly externalDisplayName: string | null;
  readonly matchMethod: ExternalIdentityMatchMethod;
  readonly matchConfidence: number | null;
};

/**
 * identity-graph.ts's pure decision: AMBIGUOUS/UNRESOLVED are real, expected
 * outcomes, never silently collapsed into a guess. No fuzzy-similarity tier
 * exists anywhere in this type or its resolver — see identity-graph.ts.
 */
export type IdentityResolution =
  | { readonly status: "RESOLVED"; readonly canonicalEntityId: string; readonly method: ExternalIdentityMatchMethod; readonly confidence: number }
  | { readonly status: "AMBIGUOUS"; readonly candidateCanonicalEntityIds: readonly string[] }
  | { readonly status: "UNRESOLVED" };

// ---------------------------------------------------------------------------
// Truth Authority
// ---------------------------------------------------------------------------

export type TruthApplicability = "READ" | "WRITE";

/**
 * truth-authority.ts's deterministic outcome. UNCONFIGURED_SINGLE_SOURCE is
 * the one auto-resolved case with zero configured rules — there is only one
 * candidate at all, so there is no disagreement to arbitrate (see rule 6,
 * "no silent last-write-wins": picking the only option is not picking among
 * several). Every other multi-candidate case without a configured PRIMARY is
 * CONFLICT, never resolved by guessing.
 */
export type TruthAuthorityResolution =
  | { readonly status: "RESOLVED"; readonly primarySourceId: string; readonly supportingSourceIds: readonly string[] }
  | { readonly status: "UNCONFIGURED_SINGLE_SOURCE"; readonly sourceId: string }
  | { readonly status: "CONFLICT"; readonly candidateSourceIds: readonly string[] }
  | { readonly status: "SOURCE_UNAVAILABLE"; readonly sourceIds: readonly string[] }
  | { readonly status: "UNCONFIGURED_NO_SOURCE" };

// ---------------------------------------------------------------------------
// Provenance — composed onto results, never replacing canonical-operation's
// own CanonicalOperationResultV1 (see types.ts's own doc comment there).
// ---------------------------------------------------------------------------

export type TruthProvenance = {
  readonly sourceId: string;
  readonly provider: ConnectorProvider;
  readonly externalEntityId: string | null;
  readonly observedAt: string;
  readonly freshness: "LIVE" | "RECENT" | "STALE" | "UNKNOWN";
  readonly authorityRole: "PRIMARY" | "SECONDARY";
  readonly confidence?: number;
  readonly canonicalEntityId: string;
  readonly factScope: string;
};

// ---------------------------------------------------------------------------
// Connector Gateway — the universal adapter surface. A real Logo/HubSpot/etc
// adapter is a new implementation of this contract, never a new runtime.
// ---------------------------------------------------------------------------

export type ConnectorReadRequest = {
  readonly organizationId: string;
  readonly factScope: string;
  readonly externalEntityType?: string;
  readonly externalEntityId?: string;
  readonly params?: Record<string, unknown>;
};

export type ConnectorReadResult =
  | { readonly status: "OK"; readonly value: unknown; readonly observedAt: string }
  | { readonly status: "NOT_FOUND"; readonly observedAt: string }
  | { readonly status: "UNSUPPORTED"; readonly observedAt: string }
  | { readonly status: "UNAVAILABLE"; readonly observedAt: string; readonly errorMessage?: string };

export type ConnectorEntityLookupResult = {
  readonly externalEntityId: string;
  readonly displayName: string;
  readonly confidence: number;
} | null;

export type ConnectorAdapter = {
  /** Matches ConnectorSourceDescriptor.provider — the Gateway looks adapters up by this, not by per-org sourceId. */
  readonly provider: ConnectorProvider;
  readonly displayName: string;
  readonly supportedCapabilities: readonly string[];
  health(organizationId: string): Promise<ConnectorSourceHealth>;
  read(request: ConnectorReadRequest): Promise<ConnectorReadResult>;
  /**
   * Optional: only sources actually wired for a canonical WRITE dispatch
   * implement this. write-routing.ts never calls a non-native adapter's
   * write in this operation (see its own doc comment) — this exists so the
   * contract is real and a future adapter has somewhere to implement it.
   */
  resolveEntity?(organizationId: string, rawReference: string, externalEntityType: string): Promise<ConnectorEntityLookupResult>;
};
