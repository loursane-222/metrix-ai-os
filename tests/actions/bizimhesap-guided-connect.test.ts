import { randomBytes } from "node:crypto";

import { RunContext } from "@openai/agents";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import {
  BizimHesapConnectionFailedError,
  executeBizimHesapConnect,
  executeBizimHesapConnectWithFirstSync
} from "../../src/lib/actions/bizimhesap-connect";
import { executeBizimHesapSync } from "../../src/lib/actions/bizimhesap-sync";
import { executeIntegrationConnect } from "../../src/lib/actions/integration-connect";
import { executeIntegrationDisconnect } from "../../src/lib/actions/integration-disconnect";
import { lookupIntegrationStatus } from "../../src/lib/data/integration-status";
import { lookupProductServicesForOrganization as lookupProductServices } from "../../src/lib/data/product-service-lookup";
import { lookupLocationsForOrganization as lookupLocations } from "../../src/lib/data/location-lookup";
import { decryptSecret } from "../../src/lib/integrations/credential-crypto";
import {
  BIZIMHESAP_B2B_KEY,
  type FetchLike
} from "../../src/lib/integrations/bizimhesap/bizimhesap-client";
import { createIntegrationConnectTool } from "../../src/lib/agent/tools/integration-connect-tool";
import { createIntegrationStatusTool } from "../../src/lib/agent/tools/integration-status-tool";
import { createIntegrationDisconnectTool } from "../../src/lib/agent/tools/integration-disconnect-tool";
import { projectCapabilityResults } from "../../src/lib/presentation/project-result";

const SECRET = "SENTINEL-merchant-token-7f3a9c";
const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

function fetchOf(byPath: Record<string, unknown>): FetchLike {
  return async (url) => {
    const path = new URL(url).pathname.replace("/api/b2b", "");
    return { ok: true, status: 200, json: async () => byPath[path] ?? [] };
  };
}

function failing(status: number): FetchLike {
  return async () => ({ ok: false, status, json: async () => ({}) });
}

function throwing(): FetchLike {
  return async () => {
    throw new Error(`socket hang up (${SECRET})`);
  };
}

const CATALOG = fetchOf({
  "/warehouses": [{ id: "w1", name: "Merkez Depo" }, { id: "w2", name: "Şube Depo" }],
  "/products": [{ id: "p1", name: "Vida M8" }, { id: "p2", name: "Somun M8" }]
});

const BROKEN_CATALOG = fetchOf({
  "/warehouses": [{ id: "w1", name: "Merkez Depo" }],
  "/products": [{ nothing: "identifiable" }]
});

const created: { organizationId: string; userId: string }[] = [];

async function tenant(label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-${label}`;
  const organizationId = `bh-guided-org-${suffix}`;
  const userId = `bh-guided-user-${suffix}`;

  await db.organization.create({ data: { id: organizationId, name: `Tenant ${label}` } });
  await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "User" } });
  await db.organizationMember.create({ data: { organizationId, userId, role: "MEMBER" } });
  created.push({ organizationId, userId });

  return { organizationId, userId };
}

function connectionOf(organizationId: string) {
  return db.integrationConnection.findUnique({
    where: { organizationId_provider: { organizationId, provider: "BIZIMHESAP" } }
  });
}

function serialized(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

describe("BizimHesap guided connect lifecycle", () => {
  it("connect_action: BIZIMHESAP resolves to a secure-credential descriptor with no secret and no OAuth redirect", async () => {
    const { organizationId, userId } = await tenant("descriptor");

    const result = await executeIntegrationConnect({
      actorUserId: userId,
      organizationId,
      provider: "BIZIMHESAP"
    });

    expect(result).toMatchObject({
      provider: "BIZIMHESAP",
      alreadyConnected: false,
      connectionMethod: "SECURE_CREDENTIAL",
      submitUrl: "/api/integrations/bizimhesap/connect",
      guidanceVerified: false
    });
    expect(result).not.toHaveProperty("connectUrl");
    expect(serialized(result)).not.toMatch(/https?:\/\//);

    // NYLAS keeps its OAuth shape untouched.
    const nylas = await executeIntegrationConnect({
      actorUserId: userId,
      organizationId,
      provider: "NYLAS"
    });
    expect(nylas).toMatchObject({ connectUrl: "/api/integrations/nylas/connect" });
    expect(nylas).not.toHaveProperty("connectionMethod");
  });

  it("the secure-field value reaches the provider as the Token header and the protocol constant as the Key header — on connect and on the first sync", async () => {
    const { organizationId, userId } = await tenant("headers");
    const seen: { path: string; key?: string; token?: string }[] = [];

    const recording: FetchLike = async (url, init) => {
      const path = new URL(url).pathname.replace("/api/b2b", "");
      seen.push({ path, key: init?.headers?.Key, token: init?.headers?.Token });
      const body: Record<string, unknown> = {
        "/warehouses": [{ id: "w1", name: "Depo" }],
        "/products": [{ id: "p1", name: "Ürün" }]
      };
      return { ok: true, status: 200, json: async () => body[path] ?? [] };
    };

    await executeBizimHesapConnectWithFirstSync(
      { actorUserId: userId, organizationId, token: SECRET },
      recording
    );

    // verify (/warehouses) + sync (/warehouses, /products)
    expect(seen.map((call) => call.path)).toEqual(["/warehouses", "/warehouses", "/products"]);
    for (const call of seen) {
      expect(call.key).toBe(BIZIMHESAP_B2B_KEY);
      expect(call.token).toBe(SECRET);
    }
  });

  it("verifies against the provider, stores the token encrypted, and runs the first sync automatically", async () => {
    const { organizationId, userId } = await tenant("happy");

    const result = await executeBizimHesapConnectWithFirstSync(
      { actorUserId: userId, organizationId, token: SECRET },
      CATALOG
    );

    expect(result.status).toBe("CONNECTED");
    expect(result.firstSync).toMatchObject({
      status: "SYNCED",
      result: { locationsCreated: 2, productsCreated: 2 }
    });
    expect(serialized(result)).not.toContain(SECRET);

    const row = await connectionOf(organizationId);
    expect(row?.status).toBe("CONNECTED");
    expect(row?.lastSuccessfulSyncAt).not.toBeNull();
    expect(row?.credentialsEncrypted).not.toContain(SECRET);
    expect(JSON.parse(decryptSecret(row!.credentialsEncrypted)).token).toBe(SECRET);

    // Canonical readback through the ordinary business capabilities.
    const products = await lookupProductServices({ actorUserId: userId, organizationId, query: "Vida" });
    expect(serialized(products)).toContain("Vida M8");
    const locations = await lookupLocations({ actorUserId: userId, organizationId });
    expect(serialized(locations)).toContain("Merkez Depo");

    const status = await lookupIntegrationStatus({ actorUserId: userId, organizationId, provider: "BIZIMHESAP" });
    expect(status).toMatchObject({
      connected: true,
      status: "CONNECTED",
      syncState: "SYNCED",
      syncedProducts: 2,
      syncedWarehouses: 2,
      lastErrorCode: null
    });
    expect(serialized(status)).not.toContain(SECRET);
  });

  it("an invalid credential never persists CONNECTED, never stores the rejected token, and reports a rejection", async () => {
    const { organizationId, userId } = await tenant("invalid");

    const error = await executeBizimHesapConnectWithFirstSync(
      { actorUserId: userId, organizationId, token: SECRET },
      failing(401)
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BizimHesapConnectionFailedError);
    expect((error as BizimHesapConnectionFailedError).reason).toBe("CREDENTIALS_REJECTED");
    expect((error as Error).message).not.toContain(SECRET);

    const row = await connectionOf(organizationId);
    expect(row?.status).toBe("ERROR");
    expect(row?.credentialsEncrypted).not.toContain(SECRET);
    expect(decryptSecret(row!.credentialsEncrypted)).not.toContain(SECRET);

    const status = await lookupIntegrationStatus({ actorUserId: userId, organizationId, provider: "BIZIMHESAP" });
    expect(status.connected).toBe(false);
  });

  it("a network/provider failure is reported as unavailable — not as a wrong token — and records nothing", async () => {
    const { organizationId, userId } = await tenant("outage");

    for (const fetchImpl of [failing(503), throwing()]) {
      const error = await executeBizimHesapConnect(
        { actorUserId: userId, organizationId, token: SECRET },
        fetchImpl
      ).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BizimHesapConnectionFailedError);
      expect((error as BizimHesapConnectionFailedError).reason).toBe("PROVIDER_UNAVAILABLE");
      expect((error as Error).message).not.toContain(SECRET);
    }

    expect(await connectionOf(organizationId)).toBeNull();
  });

  it("a 200 that is not a list is not treated as a proven connection", async () => {
    const { organizationId, userId } = await tenant("shape");

    await expect(
      executeBizimHesapConnect(
        { actorUserId: userId, organizationId, token: SECRET },
        fetchOf({ "/warehouses": { error: "bad token" } })
      )
    ).rejects.toBeInstanceOf(BizimHesapConnectionFailedError);

    expect((await connectionOf(organizationId))?.status).not.toBe("CONNECTED");
  });

  it("connected-but-sync-failed keeps the connection CONNECTED, is reported as SYNC_FAILED, and a retry finishes it", async () => {
    const { organizationId, userId } = await tenant("syncfail");

    const result = await executeBizimHesapConnectWithFirstSync(
      { actorUserId: userId, organizationId, token: SECRET },
      BROKEN_CATALOG
    );

    expect(result.status).toBe("CONNECTED");
    expect(result.firstSync).toEqual({ status: "SYNC_FAILED" });

    const row = await connectionOf(organizationId);
    expect(row?.status).toBe("CONNECTED");
    expect(row?.lastSuccessfulSyncAt).toBeNull();
    expect(row?.lastErrorCode).toBe("BIZIMHESAP_UNRECOGNIZED_RECORDS");

    const failed = await lookupIntegrationStatus({ actorUserId: userId, organizationId, provider: "BIZIMHESAP" });
    expect(failed).toMatchObject({ connected: true, syncState: "SYNC_FAILED" });

    // "Tekrar deneyelim" → integration_connect finishes the lifecycle. The
    // provider is healthy now, so the same retry succeeds.
    await executeBizimHesapSync({ actorUserId: userId, organizationId }, CATALOG);

    const recovered = await lookupIntegrationStatus({ actorUserId: userId, organizationId, provider: "BIZIMHESAP" });
    expect(recovered).toMatchObject({ connected: true, syncState: "SYNCED", lastErrorCode: null });
  });

  it("already connected: no credential form is re-opened, and the real state is returned", async () => {
    const { organizationId, userId } = await tenant("already");

    await executeBizimHesapConnectWithFirstSync(
      { actorUserId: userId, organizationId, token: SECRET },
      CATALOG
    );

    const result = await executeIntegrationConnect({
      actorUserId: userId,
      organizationId,
      provider: "BIZIMHESAP"
    });

    expect(result).toEqual({
      provider: "BIZIMHESAP",
      alreadyConnected: true,
      email: null,
      syncState: "SYNCED"
    });
    expect(projectCapabilityResults([{ capability: "integration_connect", operation: "read", data: { ...result } }])[0]?.type).not.toBe("SECURE_CREDENTIAL");
  });

  it("a wrong token typed into a second attempt cannot break a working connection", async () => {
    const { organizationId, userId } = await tenant("noclobber");

    await executeBizimHesapConnectWithFirstSync(
      { actorUserId: userId, organizationId, token: SECRET },
      CATALOG
    );

    await expect(
      executeBizimHesapConnect({ actorUserId: userId, organizationId, token: "wrong" }, failing(401))
    ).rejects.toBeInstanceOf(BizimHesapConnectionFailedError);

    const row = await connectionOf(organizationId);
    expect(row?.status).toBe("CONNECTED");
    expect(JSON.parse(decryptSecret(row!.credentialsEncrypted)).token).toBe(SECRET);
  });

  it("organization isolation: another tenant sees no connection, no synced truth, and cannot sync or read this one", async () => {
    const a = await tenant("iso-a");
    const b = await tenant("iso-b");

    await executeBizimHesapConnectWithFirstSync(
      { actorUserId: a.userId, organizationId: a.organizationId, token: SECRET },
      CATALOG
    );

    const statusB = await lookupIntegrationStatus({ actorUserId: b.userId, organizationId: b.organizationId, provider: "BIZIMHESAP" });
    expect(statusB).toMatchObject({ connected: false, status: "DISCONNECTED", syncedProducts: 0, syncedWarehouses: 0 });

    expect(await connectionOf(b.organizationId)).toBeNull();
    expect(serialized(await lookupProductServices({ actorUserId: b.userId, organizationId: b.organizationId, query: "Vida" }))).not.toContain("Vida M8");

    // B's user may not act on A's organization at all.
    await expect(
      executeBizimHesapConnect({ actorUserId: b.userId, organizationId: a.organizationId, token: "x" }, CATALOG)
    ).rejects.toBeDefined();
    await expect(
      lookupIntegrationStatus({ actorUserId: b.userId, organizationId: a.organizationId, provider: "BIZIMHESAP" })
    ).rejects.toBeDefined();
  });

  it("disconnect works for BIZIMHESAP, keeps Company Truth, and a reconnect re-syncs without duplicating", async () => {
    const { organizationId, userId } = await tenant("disconnect");

    await executeBizimHesapConnectWithFirstSync(
      { actorUserId: userId, organizationId, token: SECRET },
      CATALOG
    );

    const result = await executeIntegrationDisconnect({ actorUserId: userId, organizationId, provider: "BIZIMHESAP" });
    expect(result).toEqual({ provider: "BIZIMHESAP", disconnected: true });
    expect(serialized(result)).not.toContain(SECRET);

    const status = await lookupIntegrationStatus({ actorUserId: userId, organizationId, provider: "BIZIMHESAP" });
    expect(status).toMatchObject({ connected: false, status: "DISCONNECTED", syncedProducts: 2, syncedWarehouses: 2 });
    expect(await db.productService.count({ where: { organizationId } })).toBe(2);

    await executeBizimHesapConnectWithFirstSync({ actorUserId: userId, organizationId, token: SECRET }, CATALOG);
    expect(await db.productService.count({ where: { organizationId } })).toBe(2);
    expect(await db.location.count({ where: { organizationId } })).toBe(2);
    expect(await db.externalSourceBinding.count({ where: { organizationId, sourceSystem: "bizimhesap" } })).toBe(4);
  });

  it("through the Executive tools: connect → status → disconnect for BIZIMHESAP, with no secret in any tool output or projected presentation", async () => {
    const { organizationId, userId } = await tenant("tools");
    const context = () => new RunContext({ actorUserId: userId, organizationId, turnId: `bh-turn-${Math.random()}` });

    const connectOut = serialized(await createIntegrationConnectTool().invoke(context(), JSON.stringify({ provider: "BIZIMHESAP" })));
    expect(connectOut).toContain('"connectionMethod":"SECURE_CREDENTIAL"');
    expect(connectOut).toContain("/api/integrations/bizimhesap/connect");
    expect(connectOut).not.toContain("connectUrl");

    const presentation = projectCapabilityResults([
      { capability: "integration_connect", operation: "read", data: JSON.parse(connectOut) }
    ]);
    expect(presentation).toHaveLength(1);
    expect(presentation[0]).toMatchObject({
      type: "SECURE_CREDENTIAL",
      provider: "BIZIMHESAP",
      submitUrl: "/api/integrations/bizimhesap/connect",
      fields: [{ name: "token", label: expect.any(String) }]
    });

    await executeBizimHesapConnectWithFirstSync({ actorUserId: userId, organizationId, token: SECRET }, CATALOG);

    const statusOut = serialized(await createIntegrationStatusTool().invoke(context(), JSON.stringify({ provider: "BIZIMHESAP" })));
    expect(statusOut).toContain('"connected":true');
    expect(statusOut).toContain('"syncState":"SYNCED"');

    const disconnectOut = serialized(await createIntegrationDisconnectTool().invoke(context(), JSON.stringify({ provider: "BIZIMHESAP" })));
    expect(disconnectOut).toContain('"disconnected":true');

    for (const output of [connectOut, statusOut, disconnectOut, serialized(presentation)]) {
      expect(output).not.toContain(SECRET);
      expect(output).not.toContain("BZMHB2B");
    }
  });
});

afterAll(async () => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;

  for (const { organizationId, userId } of created) {
    await db.externalSourceBinding.deleteMany({ where: { organizationId } });
    await db.productService.deleteMany({ where: { organizationId } });
    await db.location.deleteMany({ where: { organizationId } });
    await db.integrationConnection.deleteMany({ where: { organizationId } });
    await db.organizationMember.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.user.deleteMany({ where: { id: userId } });
  }

  await db.$disconnect();
});
