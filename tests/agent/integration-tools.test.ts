import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";

import { createIntegrationStatusTool } from "../../src/lib/agent/tools/integration-status-tool";
import { createIntegrationConnectTool } from "../../src/lib/agent/tools/integration-connect-tool";
import { createIntegrationDisconnectTool } from "../../src/lib/agent/tools/integration-disconnect-tool";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-integration-org-${suffix}`;
const userId = `tool-integration-user-${suffix}`;

const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

function newContext() {
  return new RunContext({
    actorUserId: userId,
    organizationId,
    turnId: `integration-turn-${suffix}-${Math.random()}`
  });
}

describe("integration_status/connect/disconnect executive tools", () => {
  it("the full native chain works end to end with no Nylas credential configured", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Tool Integration Org" }
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "Tool User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    const status = createIntegrationStatusTool();
    const connect = createIntegrationConnectTool();
    const disconnect = createIntegrationDisconnectTool();

    const statusBefore = await status.invoke(
      newContext(),
      JSON.stringify({ provider: "NYLAS" })
    );
    expect(
      typeof statusBefore === "string" ? statusBefore : JSON.stringify(statusBefore)
    ).toContain('"connected":false');

    const connectResult = await connect.invoke(
      newContext(),
      JSON.stringify({ provider: "NYLAS" })
    );
    const connectSerialized =
      typeof connectResult === "string" ? connectResult : JSON.stringify(connectResult);
    expect(connectSerialized).toContain('"connectUrl":"/api/integrations/nylas/connect"');
    expect(connectSerialized).not.toContain("alreadyConnected\":true");

    await db.integrationConnection.create({
      data: {
        organizationId,
        provider: "NYLAS",
        status: "CONNECTED",
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ grantId: "grant-1", email: "sahibi@example.test", provider: "google" })
        )
      }
    });

    const connectAgain = await connect.invoke(
      newContext(),
      JSON.stringify({ provider: "NYLAS" })
    );
    const connectAgainSerialized =
      typeof connectAgain === "string" ? connectAgain : JSON.stringify(connectAgain);
    expect(connectAgainSerialized).toContain('"alreadyConnected":true');
    expect(connectAgainSerialized).toContain("sahibi@example.test");

    const disconnectResult = await disconnect.invoke(
      newContext(),
      JSON.stringify({ provider: "NYLAS" })
    );
    const disconnectSerialized =
      typeof disconnectResult === "string"
        ? disconnectResult
        : JSON.stringify(disconnectResult);
    expect(disconnectSerialized).toContain('"disconnected":true');

    const statusAfter = await status.invoke(
      newContext(),
      JSON.stringify({ provider: "NYLAS" })
    );
    expect(
      typeof statusAfter === "string" ? statusAfter : JSON.stringify(statusAfter)
    ).toContain('"connected":false');
  });
});

afterAll(async () => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.integrationConnection.deleteMany({ where: { organizationId } });
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });

  await db.$disconnect();
});
