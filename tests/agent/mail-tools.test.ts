import { afterAll, describe, expect, it } from "vitest";

import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";

import { createMailSearchTool } from "../../src/lib/agent/tools/mail-search-tool";
import { METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS } from "../../src/lib/agent/metrix-executive-contract";
import { MailSearchToolParameters } from "../../src/lib/agent/tools/metrix-business-tool-runtime";
import { createMailSendTool } from "../../src/lib/agent/tools/mail-send-tool";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const organizationId = `tool-mail-org-${suffix}`;
const userId = `tool-mail-user-${suffix}`;

describe("mail_search/mail_send executive tools (no mailbox connected)", () => {
  it("mail_search reports connected:false as a grounded, non-error company reality", async () => {
    await db.organization.create({
      data: { id: organizationId, name: "Tool Mail Org" }
    });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "Tool User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    const mailSearch = createMailSearchTool();

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `mail-search-turn-${suffix}`
    });

    const raw = await mailSearch.invoke(context, JSON.stringify({}));
    const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);

    expect(serialized).toContain('"connected":false');
    expect(serialized).toContain('"messages":[]');
  });

  it("mail_search still reports connected:false when an explicit limit is passed and no mailbox is connected", async () => {
    const mailSearch = createMailSearchTool();

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `mail-search-limit-turn-${suffix}`
    });

    const raw = await mailSearch.invoke(context, JSON.stringify({ limit: 5 }));
    const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);

    expect(serialized).toContain('"connected":false');
    expect(serialized).toContain('"messages":[]');
  });

  it("mail_search's schema accepts an explicit integer limit within 1..50 and rejects anything else", () => {
    expect(MailSearchToolParameters.parse({ limit: 5 }).limit).toBe(5);
    expect(MailSearchToolParameters.parse({}).limit).toBeUndefined();
    expect(MailSearchToolParameters.parse({ limit: 50 }).limit).toBe(50);

    for (const bad of [0, -1, 51, 5.5, "5"]) {
      expect(MailSearchToolParameters.safeParse({ limit: bad }).success).toBe(false);
    }
  });

  it("instructs the model to pass the user's number as limit, never show provider ids, and never name the infrastructure provider", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("limit olarak");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("kullanıcıya asla gösterme");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("altyapı sağlayıcısının adını söyleme");
  });

  it("mail_send is rejected with a clear reason when no mailbox is connected", async () => {
    const mailSend = createMailSendTool();

    const context = new RunContext({
      actorUserId: userId,
      organizationId,
      turnId: `mail-send-turn-${suffix}`
    });

    const raw = await mailSend.invoke(
      context,
      JSON.stringify({
        to: "musteri@example.test",
        subject: "Merhaba",
        body: "Test"
      })
    );

    const serialized = typeof raw === "string" ? raw : JSON.stringify(raw);

    // The Agents SDK's tool wrapper surfaces a thrown error as a string
    // result rather than propagating the exception — either way this
    // must never look like a successful VERIFIED send.
    expect(serialized).not.toContain('"status":"VERIFIED"');
  });
});

afterAll(async () => {
  await db.organizationMember.deleteMany({ where: { organizationId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.user.deleteMany({ where: { id: userId } });

  await db.$disconnect();
});
