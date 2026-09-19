import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "../../src/lib/db";
import { OrganizationAccessDeniedError } from "../../src/lib/auth/organization-access";
import {
  MailSendIdempotencyConflictError,
  MailSendUnverifiedError,
  NylasNotConnectedError,
  executeMailSend
} from "../../src/lib/actions/mail-send";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";
import { NylasRequestError } from "../../src/lib/integrations/nylas/nylas-client";
import {
  PROVIDER_MESSAGE_ID,
  createFakeNylas,
  fakeResponse
} from "../helpers/fake-nylas";

const ORIGINAL_CLIENT_ID = process.env.NYLAS_CLIENT_ID;
const ORIGINAL_API_KEY = process.env.NYLAS_API_KEY;
const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

const noSleep = async () => {};

beforeAll(() => {
  // Safety net: any code path that forgets the injected fake fetch would
  // reach here instead of the real Nylas API.
  vi.stubGlobal(
    "fetch",
    async () => {
      throw new Error("real network access is forbidden in mail-send tests");
    }
  );
});

beforeEach(() => {
  process.env.NYLAS_CLIENT_ID = "test-client-id";
  process.env.NYLAS_API_KEY = "test-api-key";
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

const createdOrgs: string[] = [];
const createdUsers: string[] = [];

async function createOrg(
  suffix: string,
  options: { connected: boolean; grantId?: string; role?: "MEMBER" | "ADMIN" | "OWNER" }
) {
  const organizationId = `mail-send-org-${suffix}`;
  const userId = `mail-send-user-${suffix}`;

  await db.organization.create({
    data: { id: organizationId, name: "Mail Send Tenant" }
  });
  await db.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "User" }
  });
  await db.organizationMember.create({
    data: { organizationId, userId, role: options.role ?? "MEMBER" }
  });

  if (options.connected) {
    await db.integrationConnection.create({
      data: {
        organizationId,
        provider: "NYLAS",
        status: "CONNECTED",
        credentialsEncrypted: encryptSecret(
          JSON.stringify({
            grantId: options.grantId ?? "grant-1",
            email: "owner@example.test",
            provider: "google"
          })
        )
      }
    });
  }

  createdOrgs.push(organizationId);
  createdUsers.push(userId);

  return { organizationId, userId };
}

function uniqueSuffix(label: string) {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${label}`;
}

function sendInput(
  ctx: { organizationId: string; userId: string },
  idempotencyKey: string,
  overrides: Partial<{ to: string; subject: string; body: string }> = {}
) {
  return {
    actorUserId: ctx.userId,
    organizationId: ctx.organizationId,
    idempotencyKey,
    to: "musteri@example.test",
    subject: "Teklifiniz Hazır",
    body: "Merhaba, teklifiniz ektedir.",
    ...overrides
  };
}

function ledgerRow(organizationId: string, idempotencyKey: string) {
  return db.actionExecution.findUnique({
    where: {
      organizationId_actionType_idempotencyKey: {
        organizationId,
        actionType: "mail.send",
        idempotencyKey
      }
    }
  });
}

afterEach(async () => {
  // Scoped strictly to the throw-away tenants this file created.
  for (const organizationId of createdOrgs.splice(0)) {
    await db.actionExecution.deleteMany({ where: { organizationId } });
    await db.integrationConnection.deleteMany({ where: { organizationId } });
    await db.organizationMember.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }

  for (const id of createdUsers.splice(0)) {
    await db.user.deleteMany({ where: { id } });
  }
});

afterAll(async () => {
  vi.unstubAllGlobals();
  process.env.NYLAS_CLIENT_ID = ORIGINAL_CLIENT_ID;
  process.env.NYLAS_API_KEY = ORIGINAL_API_KEY;
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.$disconnect();
});

describe("mail.send action — claim, send, readback, verify", () => {
  it("rejects when no mailbox is connected, without a claim or a provider call", async () => {
    const ctx = await createOrg(uniqueSuffix("noconn"), { connected: false });
    const nylas = createFakeNylas();

    await expect(
      executeMailSend(sendInput(ctx, "k-noconn"), nylas.fetchImpl, { sleep: noSleep })
    ).rejects.toBeInstanceOf(NylasNotConnectedError);

    expect(nylas.urls).toEqual([]);
    expect(await ledgerRow(ctx.organizationId, "k-noconn")).toBeNull();
  });

  it("happy path: one provider send, real message id, readback, then VERIFIED", async () => {
    const ctx = await createOrg(uniqueSuffix("happy"), { connected: true });
    const nylas = createFakeNylas();

    const result = await executeMailSend(sendInput(ctx, "k-happy"), nylas.fetchImpl, {
      sleep: noSleep
    });

    expect(result).toEqual({
      action: "mail.send",
      status: "VERIFIED",
      verified: true,
      replayed: false,
      message: { to: "musteri@example.test", subject: "Teklifiniz Hazır" }
    });

    expect(nylas.sends).toHaveLength(1);
    expect(nylas.sends[0]!.url).toContain("/v3/grants/grant-1/messages/send");
    expect(nylas.sends[0]!.payload).toEqual({
      to: [{ email: "musteri@example.test" }],
      subject: "Teklifiniz Hazır",
      body: "Merhaba, teklifiniz ektedir."
    });
    expect(nylas.gets).toEqual([PROVIDER_MESSAGE_ID]);

    const row = await ledgerRow(ctx.organizationId, "k-happy");
    expect(row?.status).toBe("VERIFIED");
    expect(row?.resourceId).toBe(PROVIDER_MESSAGE_ID);
    expect(row?.verifiedAt).not.toBeNull();

    // The raw provider id never appears in the user-facing result.
    expect(JSON.stringify(result)).not.toContain(PROVIDER_MESSAGE_ID);
  });

  it("sequential replay: same key + same payload does not send again; different payload conflicts without sending", async () => {
    const ctx = await createOrg(uniqueSuffix("replay"), { connected: true });
    const nylas = createFakeNylas();

    await executeMailSend(sendInput(ctx, "k-replay"), nylas.fetchImpl, { sleep: noSleep });

    const replay = await executeMailSend(sendInput(ctx, "k-replay"), nylas.fetchImpl, {
      sleep: noSleep
    });

    expect(replay.replayed).toBe(true);
    expect(replay.verified).toBe(true);
    expect(nylas.sends).toHaveLength(1);

    await expect(
      executeMailSend(
        sendInput(ctx, "k-replay", {
          to: "baska@example.test",
          subject: "Farklı içerik",
          body: "Farklı"
        }),
        nylas.fetchImpl,
        { sleep: noSleep }
      )
    ).rejects.toBeInstanceOf(MailSendIdempotencyConflictError);

    expect(nylas.sends).toHaveLength(1);
  });

  it("concurrent identical executions reach the provider exactly once", async () => {
    const ctx = await createOrg(uniqueSuffix("concurrent"), { connected: true });
    // Hold the send open so every caller overlaps inside the claim window.
    const nylas = createFakeNylas({ sendDelayMs: 40 });

    const settled = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        executeMailSend(sendInput(ctx, "k-concurrent"), nylas.fetchImpl, { sleep: noSleep })
      )
    );

    expect(nylas.sends).toHaveLength(1);

    const fulfilled = settled.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof executeMailSend>>> =>
        r.status === "fulfilled"
    );
    const rejected = settled.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );

    // Exactly one caller owned the claim and verified the send.
    expect(fulfilled.filter(r => r.value.replayed === false)).toHaveLength(1);
    expect(fulfilled.every(r => r.value.verified === true)).toBe(true);

    // Every caller that lost the claim failed safe — never a second send,
    // never an unverified "success".
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(MailSendUnverifiedError);
      expect((r.reason as MailSendUnverifiedError).reason).toBe("SEND_IN_FLIGHT_OR_UNKNOWN");
    }

    const rows = await db.actionExecution.findMany({
      where: { organizationId: ctx.organizationId, actionType: "mail.send" }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("VERIFIED");
    expect(rows[0]!.resourceId).toBe(PROVIDER_MESSAGE_ID);
  });

  it("provider 4xx refusal: no VERIFIED, claim released because nothing was sent", async () => {
    const ctx = await createOrg(uniqueSuffix("refused"), { connected: true });
    const nylas = createFakeNylas({
      send: async () => fakeResponse(403, { error: { message: "forbidden" } })
    });

    await expect(
      executeMailSend(sendInput(ctx, "k-refused"), nylas.fetchImpl, { sleep: noSleep })
    ).rejects.toBeInstanceOf(NylasRequestError);

    expect(nylas.sends).toHaveLength(1);
    expect(nylas.gets).toEqual([]);
    expect(await ledgerRow(ctx.organizationId, "k-refused")).toBeNull();
  });

  it("provider 5xx: outcome unknown — not VERIFIED, claim kept, no blind resend on retry", async () => {
    const ctx = await createOrg(uniqueSuffix("five"), { connected: true });
    const nylas = createFakeNylas({
      send: async () => fakeResponse(503, { error: "unavailable" })
    });

    await expect(
      executeMailSend(sendInput(ctx, "k-five"), nylas.fetchImpl, { sleep: noSleep })
    ).rejects.toMatchObject({ reason: "SEND_OUTCOME_UNKNOWN" });

    const row = await ledgerRow(ctx.organizationId, "k-five");
    expect(row?.status).toBe("PENDING");

    await expect(
      executeMailSend(sendInput(ctx, "k-five"), nylas.fetchImpl, { sleep: noSleep })
    ).rejects.toBeInstanceOf(MailSendUnverifiedError);

    expect(nylas.sends).toHaveLength(1);
  });

  it.each([
    ["TimeoutError", () => new DOMException("The operation timed out.", "TimeoutError")],
    ["AbortError", () => new DOMException("The operation was aborted.", "AbortError")],
    ["network failure", () => new TypeError("fetch failed")]
  ])(
    "%s during send: not VERIFIED, claim kept, same key never sends twice",
    async (label, makeError) => {
      const ctx = await createOrg(uniqueSuffix(`timeout-${label.replace(/\W/g, "")}`), {
        connected: true
      });
      let attempts = 0;
      const nylas = createFakeNylas({
        send: async () => {
          attempts += 1;
          throw makeError();
        }
      });

      await expect(
        executeMailSend(sendInput(ctx, "k-timeout"), nylas.fetchImpl, { sleep: noSleep })
      ).rejects.toMatchObject({ reason: "SEND_OUTCOME_UNKNOWN" });

      const row = await ledgerRow(ctx.organizationId, "k-timeout");
      expect(row?.status).toBe("PENDING");
      expect(row?.resourceId).toBe("");

      await expect(
        executeMailSend(sendInput(ctx, "k-timeout"), nylas.fetchImpl, { sleep: noSleep })
      ).rejects.toBeInstanceOf(MailSendUnverifiedError);

      expect(attempts).toBe(1);
      expect(nylas.sends).toHaveLength(1);
    }
  );

  it("missing provider message id: not VERIFIED and the idempotency key is never used as resourceId", async () => {
    const ctx = await createOrg(uniqueSuffix("noid"), { connected: true });
    const nylas = createFakeNylas({
      send: async () => fakeResponse(200, { request_id: "req-1", data: {} })
    });

    await expect(
      executeMailSend(sendInput(ctx, "k-noid"), nylas.fetchImpl, { sleep: noSleep })
    ).rejects.toMatchObject({ reason: "NO_PROVIDER_MESSAGE_ID" });

    const row = await ledgerRow(ctx.organizationId, "k-noid");
    expect(row?.status).toBe("PENDING");
    expect(row?.resourceId).not.toBe("k-noid");
    expect(row?.resourceId).toBe("");
    expect(nylas.gets).toEqual([]);

    await expect(
      executeMailSend(sendInput(ctx, "k-noid"), nylas.fetchImpl, { sleep: noSleep })
    ).rejects.toBeInstanceOf(MailSendUnverifiedError);
    expect(nylas.sends).toHaveLength(1);
  });

  it("readback failure after an accepted send: not VERIFIED, no second send; a later retry finishes verification as a read", async () => {
    const ctx = await createOrg(uniqueSuffix("rbfail"), { connected: true });
    let readable = false;
    const nylas = createFakeNylas({
      readback: async ({ messageId, sent }) =>
        readable
          ? fakeResponse(200, {
              data: { id: messageId, subject: sent?.subject, to: sent?.to }
            })
          : fakeResponse(404, {})
    });
    const sleeps: number[] = [];
    const recordSleep = async (ms: number) => {
      sleeps.push(ms);
    };

    await expect(
      executeMailSend(sendInput(ctx, "k-rbfail"), nylas.fetchImpl, { sleep: recordSleep })
    ).rejects.toMatchObject({ reason: "READBACK_FAILED" });

    // Bounded retry: 3 reads, 2 backoff sleeps, still exactly one send.
    expect(nylas.gets).toHaveLength(3);
    expect(sleeps).toHaveLength(2);
    expect(nylas.sends).toHaveLength(1);

    const pending = await ledgerRow(ctx.organizationId, "k-rbfail");
    expect(pending?.status).toBe("PENDING");
    expect(pending?.resourceId).toBe(PROVIDER_MESSAGE_ID);

    // Still unreadable → still unverified, still no second send.
    await expect(
      executeMailSend(sendInput(ctx, "k-rbfail"), nylas.fetchImpl, { sleep: noSleep })
    ).rejects.toMatchObject({ reason: "READBACK_FAILED" });
    expect(nylas.sends).toHaveLength(1);

    // Provider caught up: same key completes verification by reading only.
    readable = true;
    const resumed = await executeMailSend(sendInput(ctx, "k-rbfail"), nylas.fetchImpl, {
      sleep: noSleep
    });

    expect(resumed.verified).toBe(true);
    expect(resumed.replayed).toBe(true);
    expect(nylas.sends).toHaveLength(1);
    expect((await ledgerRow(ctx.organizationId, "k-rbfail"))?.status).toBe("VERIFIED");
  });

  it.each([
    [
      "message id",
      (messageId: string, sent: { subject: string; to: unknown }) => ({
        id: `${messageId}-other`,
        subject: sent.subject,
        to: sent.to
      })
    ],
    [
      "recipient",
      (messageId: string, sent: { subject: string }) => ({
        id: messageId,
        subject: sent.subject,
        to: [{ email: "someone-else@example.test" }]
      })
    ],
    [
      "subject",
      (messageId: string, sent: { to: unknown }) => ({
        id: messageId,
        subject: "A different subject",
        to: sent.to
      })
    ]
  ])("readback %s mismatch: not VERIFIED and not retried into a false match", async (label, makeRecord) => {
    const ctx = await createOrg(uniqueSuffix(`mismatch-${label.replace(/\W/g, "")}`), {
      connected: true
    });
    const nylas = createFakeNylas({
      readback: async ({ messageId, sent }) =>
        fakeResponse(200, {
          data: (makeRecord as (m: string, s: unknown) => unknown)(messageId, sent as never)
        })
    });

    await expect(
      executeMailSend(sendInput(ctx, "k-mismatch"), nylas.fetchImpl, { sleep: noSleep })
    ).rejects.toMatchObject({ reason: "READBACK_MISMATCH" });

    expect(nylas.gets).toHaveLength(1);
    expect(nylas.sends).toHaveLength(1);
    expect((await ledgerRow(ctx.organizationId, "k-mismatch"))?.status).toBe("PENDING");
  });

  it("readback accepts the provider's own transformation of the body and address case", async () => {
    const ctx = await createOrg(uniqueSuffix("case"), { connected: true });
    const nylas = createFakeNylas({
      readback: async ({ messageId }) =>
        fakeResponse(200, {
          data: {
            id: messageId,
            subject: "Teklifiniz Hazır",
            to: [{ name: "Müşteri", email: "Musteri@Example.TEST" }],
            body: "<div>completely different provider-rendered html</div>"
          }
        })
    });

    const result = await executeMailSend(sendInput(ctx, "k-case"), nylas.fetchImpl, {
      sleep: noSleep
    });

    expect(result.verified).toBe(true);
  });

  it("tenant isolation: each organization only ever resolves its own grant", async () => {
    const orgA = await createOrg(uniqueSuffix("tenant-a"), {
      connected: true,
      grantId: "grant-tenant-a"
    });
    const orgB = await createOrg(uniqueSuffix("tenant-b"), {
      connected: true,
      grantId: "grant-tenant-b"
    });
    const orgC = await createOrg(uniqueSuffix("tenant-c"), { connected: false });

    const nylas = createFakeNylas();

    await executeMailSend(sendInput(orgA, "k-a"), nylas.fetchImpl, { sleep: noSleep });
    expect(nylas.urls.every(u => u.includes("/grants/grant-tenant-a/"))).toBe(true);
    expect(nylas.urls.some(u => u.includes("grant-tenant-b"))).toBe(false);

    const nylasB = createFakeNylas();
    await executeMailSend(sendInput(orgB, "k-b"), nylasB.fetchImpl, { sleep: noSleep });
    expect(nylasB.urls.every(u => u.includes("/grants/grant-tenant-b/"))).toBe(true);

    // An org with no connection of its own never borrows another's grant.
    const nylasC = createFakeNylas();
    await expect(
      executeMailSend(sendInput(orgC, "k-c"), nylasC.fetchImpl, { sleep: noSleep })
    ).rejects.toBeInstanceOf(NylasNotConnectedError);
    expect(nylasC.urls).toEqual([]);

    // A member of org C cannot act inside org A at all.
    const nylasX = createFakeNylas();
    await expect(
      executeMailSend(
        { ...sendInput(orgA, "k-x"), actorUserId: orgC.userId },
        nylasX.fetchImpl,
        { sleep: noSleep }
      )
    ).rejects.toBeInstanceOf(OrganizationAccessDeniedError);
    expect(nylasX.urls).toEqual([]);
  });

  it("keeps existing behavior: any org member (role unrestricted) may send", async () => {
    const ctx = await createOrg(uniqueSuffix("member"), { connected: true, role: "MEMBER" });
    const nylas = createFakeNylas();

    const result = await executeMailSend(sendInput(ctx, "k-member"), nylas.fetchImpl, {
      sleep: noSleep
    });

    expect(result.verified).toBe(true);
  });
});
