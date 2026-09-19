import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";
import { createMailSendTool } from "../../src/lib/agent/tools/mail-send-tool";
import {
  beginToolCallCapture,
  canonicalResultsFromToolCalls,
  endToolCallCapture,
  executeMetrixBusinessTool
} from "../../src/lib/agent/tools/metrix-business-tool-runtime";
import { projectCapabilityResults } from "../../src/lib/presentation/project-result";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";
import {
  PROVIDER_MESSAGE_ID,
  createFakeNylas,
  fakeResponse,
  type FakeNylasConfig
} from "../helpers/fake-nylas";

// Drives the real canonical chain — Sol's tool wrapper → executeMetrixBusinessTool
// → dispatch → executeMailSend → Nylas client — against a stubbed global
// fetch. Nothing here can reach real Nylas or Gmail.

const ORIGINAL_CLIENT_ID = process.env.NYLAS_CLIENT_ID;
const ORIGINAL_API_KEY = process.env.NYLAS_API_KEY;
const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `canon-mail-org-${suffix}`;
const userId = `canon-mail-user-${suffix}`;

let turnCounter = 0;
let nylas = createFakeNylas();

function useFakeNylas(config: FakeNylasConfig = {}) {
  nylas = createFakeNylas(config);
}

beforeAll(async () => {
  process.env.NYLAS_CLIENT_ID = "test-client-id";
  process.env.NYLAS_API_KEY = "test-api-key";
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");

  vi.stubGlobal("fetch", (url: string, init?: Parameters<typeof fetch>[1]) =>
    nylas.fetchImpl(url, init as never)
  );

  await db.organization.create({ data: { id: organizationId, name: "Canonical Mail Org" } });
  await db.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "Canonical User" }
  });
  await db.organizationMember.create({
    data: { organizationId, userId, role: "MEMBER" }
  });
  await db.integrationConnection.create({
    data: {
      organizationId,
      provider: "NYLAS",
      status: "CONNECTED",
      credentialsEncrypted: encryptSecret(
        JSON.stringify({ grantId: "grant-canon", email: "owner@example.test", provider: "google" })
      )
    }
  });
});

beforeEach(() => {
  turnCounter += 1;
  useFakeNylas();
});

afterEach(async () => {
  await db.actionExecution.deleteMany({ where: { organizationId } });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  process.env.NYLAS_CLIENT_ID = ORIGINAL_CLIENT_ID;
  process.env.NYLAS_API_KEY = ORIGINAL_API_KEY;
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;

  await db.actionExecution.deleteMany({ where: { organizationId } });
  await db.integrationConnection.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

const MAIL_ARGS = JSON.stringify({
  to: "test@example.test",
  subject: "METRIX Gmail Send Acceptance",
  body: "Kısa bir test e-postası."
});

function trustedContext(turnId: string) {
  return {
    actorUserId: userId,
    organizationId,
    idempotencyScope: `turn:${turnId}`,
    timezone: "Europe/Istanbul",
    referenceTimeIso: "2026-09-18T12:00:00.000Z"
  };
}

describe("mail_send through the canonical chain", () => {
  it("success: VERIFIED capability result, projected, with no raw provider id anywhere user-facing", async () => {
    const turnId = `success-${suffix}-${turnCounter}`;
    const scope = `turn:${turnId}`;

    beginToolCallCapture(scope);
    const result = await executeMetrixBusinessTool({
      name: "mail_send",
      argumentsJson: MAIL_ARGS,
      context: trustedContext(turnId)
    });
    const captured = endToolCallCapture(scope);

    expect(result).toMatchObject({ action: "mail.send", status: "VERIFIED", verified: true });
    expect(nylas.sends).toHaveLength(1);

    const canonical = canonicalResultsFromToolCalls(captured);
    expect(canonical).toHaveLength(1);
    expect(canonical[0]).toMatchObject({
      capability: "mail_send",
      operation: "mutation",
      verification: { status: "VERIFIED", verified: true }
    });

    const presentations = projectCapabilityResults(canonical);

    expect(JSON.stringify({ result, canonical, presentations })).not.toContain(
      PROVIDER_MESSAGE_ID
    );
  });

  it.each<[string, FakeNylasConfig, string]>([
    [
      "provider 4xx refusal",
      { send: async () => fakeResponse(403, { error: "forbidden" }) },
      "HTTP_403"
    ],
    [
      "provider 5xx (outcome unknown)",
      { send: async () => fakeResponse(503, {}) },
      "SEND_OUTCOME_UNKNOWN"
    ],
    [
      "send timeout (outcome unknown)",
      {
        send: async () => {
          throw new DOMException("The operation timed out.", "TimeoutError");
        }
      },
      "SEND_OUTCOME_UNKNOWN"
    ],
    [
      "2xx without a provider message id",
      { send: async () => fakeResponse(200, { data: {} }) },
      "NO_PROVIDER_MESSAGE_ID"
    ],
    [
      "readback mismatch",
      {
        readback: async ({ messageId, sent }) =>
          fakeResponse(200, {
            data: { id: messageId, subject: "Another subject", to: sent?.to }
          })
      },
      "READBACK_MISMATCH"
    ]
  ])(
    "%s never surfaces as verified success (buffer, canonical result, presentation)",
    async (_label, config, expected) => {
      useFakeNylas(config);

      const turnId = `fail-${suffix}-${turnCounter}`;
      const scope = `turn:${turnId}`;

      // Sol's tool wrapper: an error is handed back to the model as a
      // string, never as a verified result.
      const tool = createMailSendTool();
      beginToolCallCapture(scope);
      const raw = await tool.invoke(
        new RunContext({ actorUserId: userId, organizationId, turnId }),
        MAIL_ARGS
      );
      const captured = endToolCallCapture(scope);

      const output = typeof raw === "string" ? raw : JSON.stringify(raw);

      expect(output).toContain(expected);
      expect(output).not.toContain('"status":"VERIFIED"');
      expect(output).not.toContain('"verified":true');
      expect(output).not.toContain(PROVIDER_MESSAGE_ID);

      expect(captured).toEqual([]);
      const canonical = canonicalResultsFromToolCalls(captured);
      expect(canonical).toEqual([]);
      expect(projectCapabilityResults(canonical)).toEqual([]);

      expect(nylas.sends).toHaveLength(1);
    }
  );

  it("an unverified outcome never triggers a second provider send on a same-turn retry", async () => {
    useFakeNylas({ send: async () => fakeResponse(503, {}) });

    const turnId = `retry-${suffix}-${turnCounter}`;
    const context = trustedContext(turnId);

    await expect(
      executeMetrixBusinessTool({ name: "mail_send", argumentsJson: MAIL_ARGS, context })
    ).rejects.toMatchObject({ code: "MAIL_SEND_UNVERIFIED" });

    await expect(
      executeMetrixBusinessTool({ name: "mail_send", argumentsJson: MAIL_ARGS, context })
    ).rejects.toMatchObject({ code: "MAIL_SEND_UNVERIFIED" });

    expect(nylas.sends).toHaveLength(1);
  });
});
