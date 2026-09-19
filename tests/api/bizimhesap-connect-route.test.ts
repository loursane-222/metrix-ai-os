import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../../src/lib/db";
import { decryptSecret } from "../../src/lib/integrations/credential-crypto";

const SECRET = "SENTINEL-route-token-91be42";

const mocks = vi.hoisted(() => ({ resolveAuthenticatedExecutiveContext: vi.fn() }));

vi.mock("../../src/lib/auth/executive-session-context", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/auth/executive-session-context")
  >("../../src/lib/auth/executive-session-context");

  return {
    ...actual,
    resolveAuthenticatedExecutiveContext: mocks.resolveAuthenticatedExecutiveContext
  };
});

import { ExecutiveAuthenticationError } from "../../src/lib/auth/executive-session-context";
import { POST } from "../../src/app/api/integrations/bizimhesap/connect/route";

const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `bh-route-org-${suffix}`;
const userId = `bh-route-user-${suffix}`;

function stubProvider(behaviour: "ok" | "reject" | "outage" | "network") {
  vi.stubGlobal("fetch", async (url: string) => {
    if (behaviour === "network") throw new Error(`ECONNRESET ${SECRET}`);
    if (behaviour === "outage") return { ok: false, status: 503, json: async () => ({ echo: SECRET }) };
    if (behaviour === "reject") return { ok: false, status: 401, json: async () => ({ message: `bad ${SECRET}` }) };

    const path = new URL(url).pathname.replace("/api/b2b", "");
    const body: Record<string, unknown> = {
      "/warehouses": [{ id: "w1", name: "Depo" }],
      "/products": [{ id: "p1", name: "Ürün" }]
    };

    return { ok: true, status: 200, json: async () => body[path] ?? [] };
  });
}

function request(body: unknown) {
  return new Request("http://localhost/api/integrations/bizimhesap/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function consoleSpies() {
  return (["log", "info", "warn", "error", "debug"] as const).map(level =>
    vi.spyOn(console, level).mockImplementation(() => undefined)
  );
}

beforeEach(async () => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  mocks.resolveAuthenticatedExecutiveContext.mockResolvedValue({
    actorUserId: userId,
    organizationId,
    timezone: "Europe/Istanbul",
    referenceTimeIso: new Date().toISOString()
  });

  await db.organization.upsert({ where: { id: organizationId }, update: {}, create: { id: organizationId, name: "Route Tenant" } });
  await db.user.upsert({ where: { id: userId }, update: {}, create: { id: userId, email: `${userId}@example.test`, name: "U" } });
  await db.organizationMember.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    update: {},
    create: { organizationId, userId, role: "MEMBER" }
  });
  await db.integrationConnection.deleteMany({ where: { organizationId } });
});

describe("POST /api/integrations/bizimhesap/connect", () => {
  it("connects, syncs, and never echoes or logs the secret", async () => {
    stubProvider("ok");
    const spies = consoleSpies();

    const response = await POST(request({ token: SECRET }));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      ok: true,
      status: "CONNECTED",
      sync: { status: "SYNCED", products: 1, warehouses: 1 }
    });
    expect(text).not.toContain(SECRET);

    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
    }

    const row = await db.integrationConnection.findUniqueOrThrow({
      where: { organizationId_provider: { organizationId, provider: "BIZIMHESAP" } }
    });
    expect(row.credentialsEncrypted).not.toContain(SECRET);
    expect(JSON.parse(decryptSecret(row.credentialsEncrypted)).token).toBe(SECRET);
  });

  it("returns fixed, secret-free error contracts: rejected vs unavailable vs missing encryption key", async () => {
    const spies = consoleSpies();

    stubProvider("reject");
    const rejected = await POST(request({ token: SECRET }));
    const rejectedText = await rejected.text();
    expect(rejected.status).toBe(422);
    expect(JSON.parse(rejectedText)).toEqual({ ok: false, code: "BIZIMHESAP_CREDENTIALS_REJECTED" });

    for (const behaviour of ["outage", "network"] as const) {
      stubProvider(behaviour);
      const unavailable = await POST(request({ token: SECRET }));
      const unavailableText = await unavailable.text();
      expect(unavailable.status).toBe(502);
      expect(JSON.parse(unavailableText)).toEqual({ ok: false, code: "BIZIMHESAP_PROVIDER_UNAVAILABLE" });
      expect(unavailableText).not.toContain(SECRET);
    }

    delete process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;
    stubProvider("ok");
    const missing = await POST(request({ token: SECRET }));
    const missingText = await missing.text();
    expect(missing.status).toBe(503);
    expect(JSON.parse(missingText)).toEqual({ ok: false, code: "MISSING_ENCRYPTION_KEY" });
    // No key material → the credential is never stored in the clear.
    expect(
      (await db.integrationConnection.findUnique({
        where: { organizationId_provider: { organizationId, provider: "BIZIMHESAP" } }
      }))?.status
    ).not.toBe("CONNECTED");

    expect(rejectedText).not.toContain(SECRET);
    expect(missingText).not.toContain(SECRET);
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
    }
  });

  it("requires authentication and rejects malformed or extra fields without echoing input", async () => {
    stubProvider("ok");

    mocks.resolveAuthenticatedExecutiveContext.mockRejectedValueOnce(
      new ExecutiveAuthenticationError("UNAUTHENTICATED", 401)
    );
    const unauthenticated = await POST(request({ token: SECRET }));
    expect(unauthenticated.status).toBe(401);
    expect(await db.integrationConnection.count({ where: { organizationId } })).toBe(0);

    const extra = await POST(request({ token: SECRET, organizationId: "someone-else" }));
    const extraText = await extra.text();
    expect(extra.status).toBe(400);
    expect(extraText).not.toContain(SECRET);

    const invalid = await POST(request("{not json"));
    expect(invalid.status).toBe(400);

    // Missing / blank merchant token: fail closed before the provider is asked.
    let providerCalls = 0;
    vi.stubGlobal("fetch", async () => {
      providerCalls += 1;
      return { ok: true, status: 200, json: async () => [] };
    });

    for (const body of [{}, { token: "" }, { token: "   " }]) {
      const missingToken = await POST(request(body));
      expect(missingToken.status).toBe(400);
      expect(JSON.parse(await missingToken.text())).toEqual({ ok: false, code: "INVALID_REQUEST" });
    }

    expect(providerCalls).toBe(0);
    expect(await db.integrationConnection.count({ where: { organizationId } })).toBe(0);
  });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.externalSourceBinding.deleteMany({ where: { organizationId } });
  await db.productService.deleteMany({ where: { organizationId } });
  await db.location.deleteMany({ where: { organizationId } });
  await db.integrationConnection.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});
