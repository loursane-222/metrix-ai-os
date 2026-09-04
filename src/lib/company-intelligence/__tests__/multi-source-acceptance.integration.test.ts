import { describe, expect, it } from "vitest";
import { createFakeReadConnector } from "./fixtures/fake-connectors";

const databaseUrl = process.env.COMPANY_INTELLIGENCE_INTEGRATION_DATABASE_URL;

/**
 * Same real-Postgres, env-var-gated pattern as ledger.integration.test.ts /
 * loan.integration.test.ts — proves the migrated schema and the platform's
 * contracts genuinely work multi-source, using fake ACCOUNTING_FAKE/
 * CRM_FAKE/ERP_FAKE adapters (no real vendor API, per this operation's
 * scope) alongside the one real source: METRIX Native, unmodified. Covers
 * the operation's acceptance letters A-J plus cross-system synthesis
 * (section 10) and native write routing (section 11's shape).
 */
describe.skipIf(!databaseUrl)("Multi-System Company Intelligence — acceptance harness (real PostgreSQL)", () => {
  async function setup() {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("@/lib/core/shared/prisma");
    const sourceRegistry = await import("../source-registry");
    const identityGraph = await import("../identity-graph");
    const truthAuthority = await import("../truth-authority");
    const connectorGateway = await import("../connector-gateway");
    const companyIntelligence = await import("../company-intelligence");
    const writeRouting = await import("../write-routing");
    const nativeBootstrap = await import("../native-source-bootstrap");

    const acme = await prisma.organization.create({ data: { name: `ACME ${Date.now()}-${Math.random()}` } });
    const otherOrg = await prisma.organization.create({ data: { name: `OtherOrg ${Date.now()}-${Math.random()}` } });

    nativeBootstrap.ensureNativeConnectorAdapterRegistered();
    if (!connectorGateway.getConnectorAdapter("ACCOUNTING_FAKE_PROVIDER")) {
      connectorGateway.registerConnectorAdapter(
        createFakeReadConnector({ provider: "ACCOUNTING_FAKE_PROVIDER", displayName: "Fake Accounting", factScope: "customer.accountingBalance", valuesByExternalEntityId: { "acc-77": 125000, "acc-secondary-77": 99999 } }),
      );
    }
    if (!connectorGateway.getConnectorAdapter("CRM_FAKE_PROVIDER")) {
      connectorGateway.registerConnectorAdapter(
        createFakeReadConnector({ provider: "CRM_FAKE_PROVIDER", displayName: "Fake CRM", factScope: "customer.crmPipeline", valuesByExternalEntityId: { "crm-9": 450000 } }),
      );
    }
    if (!connectorGateway.getConnectorAdapter("ERP_FAKE_PROVIDER")) {
      connectorGateway.registerConnectorAdapter(
        createFakeReadConnector({ provider: "ERP_FAKE_PROVIDER", displayName: "Fake ERP", factScope: "customer.erpOrders", valuesByExternalEntityId: { "erp-42": { openOrders: 3 } } }),
      );
    }

    return { prisma, acme, otherOrg, sourceRegistry, identityGraph, truthAuthority, connectorGateway, companyIntelligence, writeRouting, nativeBootstrap };
  }

  async function cleanup(prisma: Awaited<ReturnType<typeof setup>>["prisma"], organizationIds: readonly string[]) {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds as string[] } } });
    await prisma.$disconnect();
  }

  it("A-F, I: identity graph fan-in, per-fact authoritative provenance, priority-over-secondary, unsupported WRITE never falls back", async () => {
    const { prisma, acme, sourceRegistry, identityGraph, companyIntelligence, writeRouting, nativeBootstrap } = await setup();
    try {
      await nativeBootstrap.ensureNativeSourceRegistered(acme.id);
      const customer = await prisma.customer.create({ data: { organizationId: acme.id, displayName: "Atlas Makina" } });

      const accountingSource = await sourceRegistry.registerSource({
        organizationId: acme.id, sourceKey: "acme-accounting", sourceType: "ACCOUNTING", provider: "ACCOUNTING_FAKE_PROVIDER", displayName: "Fake Accounting", connectionMode: "TEST",
        capabilities: [{ id: "customer.accountingBalance", read: true, write: false }],
        authoritativeScopes: [{ factScope: "customer.accountingBalance", role: "PRIMARY", applicability: "READ" }],
      });
      // A SECONDARY source claiming the same fact, with a DIFFERENT value —
      // acceptance F: the configured PRIMARY must win, never this one.
      const accountingSecondary = await sourceRegistry.registerSource({
        organizationId: acme.id, sourceKey: "acme-accounting-secondary", sourceType: "ACCOUNTING", provider: "ACCOUNTING_FAKE_PROVIDER", displayName: "Fake Accounting (secondary)", connectionMode: "TEST",
        capabilities: [{ id: "customer.accountingBalance", read: true, write: false }],
        authoritativeScopes: [{ factScope: "customer.accountingBalance", role: "SECONDARY", applicability: "READ" }],
      });
      const crmSource = await sourceRegistry.registerSource({
        organizationId: acme.id, sourceKey: "acme-crm", sourceType: "CRM", provider: "CRM_FAKE_PROVIDER", displayName: "Fake CRM", connectionMode: "TEST",
        capabilities: [{ id: "customer.crmPipeline", read: true, write: true }],
        authoritativeScopes: [{ factScope: "customer.crmPipeline", role: "PRIMARY", applicability: "READ" }],
      });
      const erpSource = await sourceRegistry.registerSource({
        organizationId: acme.id, sourceKey: "acme-erp", sourceType: "ERP", provider: "ERP_FAKE_PROVIDER", displayName: "Fake ERP", connectionMode: "TEST",
        capabilities: [{ id: "customer.erpOrders", read: true, write: false }],
        authoritativeScopes: [{ factScope: "customer.erpOrders", role: "PRIMARY", applicability: "READ" }],
      });

      // Native bootstrap mints the canonical entity for Atlas.
      const nativeOutcome = await nativeBootstrap.resolveNativeCustomerIdentity(acme.id, customer.id, "Atlas Makina");
      expect(nativeOutcome.resolution).toBe("LINKED");
      const canonicalEntityId = (nativeOutcome as { canonicalEntityId: string }).canonicalEntityId;

      // Accounting/CRM join via the EXACT_NORMALIZED_NAME tier (a legal-suffix variant still matches).
      const accountingIngest = await identityGraph.ingestExternalRecord({ organizationId: acme.id, entityType: "customer", sourceId: accountingSource.id, externalEntityId: "acc-77", externalDisplayName: "ATLAS MAKINA LTD. ŞTİ." });
      const accountingSecondaryIngest = await identityGraph.ingestExternalRecord({ organizationId: acme.id, entityType: "customer", sourceId: accountingSecondary.id, externalEntityId: "acc-secondary-77", externalDisplayName: "Atlas Makina" });
      const crmIngest = await identityGraph.ingestExternalRecord({ organizationId: acme.id, entityType: "customer", sourceId: crmSource.id, externalEntityId: "crm-9", externalDisplayName: "Atlas Makina" });
      // ERP joins via EXPLICIT_MAPPING instead — its own display code ("ATL-001") would never name-match.
      const erpIngest = await identityGraph.ingestExternalRecord({ organizationId: acme.id, entityType: "customer", sourceId: erpSource.id, externalEntityId: "erp-42", externalDisplayName: "ATL-001", explicitCanonicalEntityId: canonicalEntityId });

      // A) Identity Graph fans all four external records into the one canonical Atlas.
      expect(accountingIngest).toMatchObject({ resolution: "LINKED", canonicalEntityId, created: false });
      expect(accountingSecondaryIngest).toMatchObject({ resolution: "LINKED", canonicalEntityId, created: false });
      expect(crmIngest).toMatchObject({ resolution: "LINKED", canonicalEntityId, created: false });
      expect(erpIngest).toMatchObject({ resolution: "LINKED", canonicalEntityId, created: false });

      // B/C/D/E) Each fact resolves from its own authoritative source, carrying provenance.
      const result = await companyIntelligence.resolveCompanyIntelligence({
        organizationId: acme.id, canonicalEntityId,
        factScopes: ["customer.profile", "customer.accountingBalance", "customer.crmPipeline", "customer.erpOrders"],
      });
      const byScope = Object.fromEntries(result.facts.map((fact) => [fact.factScope, fact]));

      expect(byScope["customer.profile"]).toMatchObject({ status: "RESOLVED", value: { id: customer.id }, provenance: { sourceId: expect.any(String), provider: "METRIX" } });
      expect(byScope["customer.accountingBalance"]).toMatchObject({ status: "RESOLVED", value: 125000, provenance: { sourceId: accountingSource.id, provider: "ACCOUNTING_FAKE_PROVIDER", authorityRole: "PRIMARY" } });
      expect(byScope["customer.crmPipeline"]).toMatchObject({ status: "RESOLVED", value: 450000, provenance: { sourceId: crmSource.id, provider: "CRM_FAKE_PROVIDER" } });
      expect(byScope["customer.erpOrders"]).toMatchObject({ status: "RESOLVED", value: { openOrders: 3 }, provenance: { sourceId: erpSource.id, provider: "ERP_FAKE_PROVIDER" } });

      // I) A WRITE-capable but non-native authoritative source never silently executes or falls back to native.
      const writeRoute = await writeRouting.resolveWriteRoute({ organizationId: acme.id, factScope: "customer.crmPipeline" });
      expect(writeRoute).toEqual({ status: "ROUTE_UNSUPPORTED_CONNECTOR", sourceId: crmSource.id, provider: "CRM_FAKE_PROVIDER" });
    } finally {
      await cleanup(prisma, [acme.id]);
    }
  });

  it("G: no configured authority among multiple eligible sources is CONFLICT, never a silent pick", async () => {
    const { prisma, acme, sourceRegistry, truthAuthority } = await setup();
    try {
      const a = await sourceRegistry.registerSource({
        organizationId: acme.id, sourceKey: "acme-a", sourceType: "CRM", provider: "CRM_FAKE_PROVIDER", displayName: "A", connectionMode: "TEST",
        capabilities: [{ id: "customer.duplicateFact", read: true, write: false }], authoritativeScopes: [],
      });
      const b = await sourceRegistry.registerSource({
        organizationId: acme.id, sourceKey: "acme-b", sourceType: "ERP", provider: "ERP_FAKE_PROVIDER", displayName: "B", connectionMode: "TEST",
        capabilities: [{ id: "customer.duplicateFact", read: true, write: false }], authoritativeScopes: [],
      });
      const resolution = await truthAuthority.resolveTruthAuthority({ organizationId: acme.id, factScope: "customer.duplicateFact", applicability: "READ" });
      if (resolution.status !== "CONFLICT") throw new Error(`expected CONFLICT, got ${resolution.status}`);
      expect([...resolution.candidateSourceIds].sort()).toEqual([a.id, b.id].sort());
    } finally {
      await cleanup(prisma, [acme.id]);
    }
  });

  it("H: an unhealthy source makes truth authority resolution SOURCE_UNAVAILABLE, not silently skipped", async () => {
    const { prisma, acme, sourceRegistry, truthAuthority, companyIntelligence, identityGraph, nativeBootstrap } = await setup();
    try {
      const customer = await prisma.customer.create({ data: { organizationId: acme.id, displayName: "Beta Ltd" } });
      const nativeOutcome = await nativeBootstrap.resolveNativeCustomerIdentity(acme.id, customer.id, "Beta Ltd");
      const canonicalEntityId = (nativeOutcome as { canonicalEntityId: string }).canonicalEntityId;

      const accountingSource = await sourceRegistry.registerSource({
        organizationId: acme.id, sourceKey: "beta-accounting", sourceType: "ACCOUNTING", provider: "ACCOUNTING_FAKE_PROVIDER", displayName: "Fake Accounting", connectionMode: "TEST",
        capabilities: [{ id: "customer.accountingBalance", read: true, write: false }],
        authoritativeScopes: [{ factScope: "customer.accountingBalance", role: "PRIMARY", applicability: "READ" }],
        status: "ERROR",
      });
      await identityGraph.ingestExternalRecord({ organizationId: acme.id, entityType: "customer", sourceId: accountingSource.id, externalEntityId: "acc-77", externalDisplayName: "Beta Ltd" });

      const authority = await truthAuthority.resolveTruthAuthority({ organizationId: acme.id, factScope: "customer.accountingBalance", applicability: "READ" });
      expect(authority).toEqual({ status: "SOURCE_UNAVAILABLE", sourceIds: [accountingSource.id] });

      const result = await companyIntelligence.resolveCompanyIntelligence({ organizationId: acme.id, canonicalEntityId, factScopes: ["customer.accountingBalance"] });
      expect(result.facts[0]).toEqual({ factScope: "customer.accountingBalance", status: "SOURCE_UNAVAILABLE", sourceIds: [accountingSource.id] });
    } finally {
      await cleanup(prisma, [acme.id]);
    }
  });

  it("native WRITE authority routes to the one real write path (ROUTE_NATIVE), proving section 11's shape without a second write runtime", async () => {
    const { prisma, acme, sourceRegistry, writeRouting, nativeBootstrap } = await setup();
    try {
      await nativeBootstrap.ensureNativeSourceRegistered(acme.id);
      // METRIX Native's own capability set (from ensureNativeSourceRegistered)
      // only declares READ for customer.profile — extend it here with a WRITE
      // scope the way a real native write capability would be declared, to
      // prove the routing shape end-to-end.
      await sourceRegistry.registerSource({
        organizationId: acme.id, sourceKey: "metrix-native", sourceType: "METRIX_NATIVE", provider: "METRIX", displayName: "METRIX Native", connectionMode: "NATIVE",
        capabilities: [{ id: "customer.profile", read: true, write: false }, { id: "customer.update", read: false, write: true }],
        authoritativeScopes: [{ factScope: "customer.profile", role: "PRIMARY", applicability: "READ" }, { factScope: "customer.update", role: "PRIMARY", applicability: "WRITE" }],
      });
      const route = await writeRouting.resolveWriteRoute({ organizationId: acme.id, factScope: "customer.update" });
      expect(route).toEqual({ status: "ROUTE_NATIVE" });
    } finally {
      await cleanup(prisma, [acme.id]);
    }
  });

  it("J: organization A's sources, canonical entities, and identities are invisible to organization B", async () => {
    const { prisma, acme, otherOrg, sourceRegistry, identityGraph, companyIntelligence, nativeBootstrap } = await setup();
    try {
      const acmeCustomer = await prisma.customer.create({ data: { organizationId: acme.id, displayName: "Gamma Ltd" } });
      const acmeOutcome = await nativeBootstrap.resolveNativeCustomerIdentity(acme.id, acmeCustomer.id, "Gamma Ltd");
      const acmeCanonicalEntityId = (acmeOutcome as { canonicalEntityId: string }).canonicalEntityId;
      const acmeAccountingSource = await sourceRegistry.registerSource({
        organizationId: acme.id, sourceKey: "gamma-accounting", sourceType: "ACCOUNTING", provider: "ACCOUNTING_FAKE_PROVIDER", displayName: "Fake Accounting", connectionMode: "TEST",
        capabilities: [{ id: "customer.accountingBalance", read: true, write: false }],
        authoritativeScopes: [{ factScope: "customer.accountingBalance", role: "PRIMARY", applicability: "READ" }],
      });
      await identityGraph.ingestExternalRecord({ organizationId: acme.id, entityType: "customer", sourceId: acmeAccountingSource.id, externalEntityId: "acc-77", externalDisplayName: "Gamma Ltd" });

      await nativeBootstrap.ensureNativeSourceRegistered(otherOrg.id);

      // otherOrg cannot see ACME's source registry rows.
      const otherOrgSources = await sourceRegistry.listSources(otherOrg.id);
      expect(otherOrgSources.some((source) => source.id === acmeAccountingSource.id)).toBe(false);
      expect(await sourceRegistry.getSourceById(otherOrg.id, acmeAccountingSource.id)).toBeNull();

      // otherOrg cannot resolve ACME's canonical entity/facts even by guessing its id.
      const crossOrgResult = await companyIntelligence.resolveCompanyIntelligence({ organizationId: otherOrg.id, canonicalEntityId: acmeCanonicalEntityId, factScopes: ["customer.accountingBalance"] });
      expect(crossOrgResult.facts[0]).toEqual({ factScope: "customer.accountingBalance", status: "NO_AUTHORITY_CONFIGURED" });
    } finally {
      await cleanup(prisma, [acme.id, otherOrg.id]);
    }
  });
});
