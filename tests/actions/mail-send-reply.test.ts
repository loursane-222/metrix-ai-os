import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { db } from "../../src/lib/db";
import {
  MailReplyTargetNotFoundError,
  NylasNotConnectedError,
  executeMailSend
} from "../../src/lib/actions/mail-send";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";
import { createFakeMailbox } from "../helpers/fake-mailbox";

const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;
const noSleep = async () => {};

beforeEach(() => {
  process.env.NYLAS_CLIENT_ID = "test-client-id";
  process.env.NYLAS_API_KEY = "test-api-key";
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createdOrgs: string[] = [];
const createdUsers: string[] = [];
let counter = 0;

async function createOrg(grantId?: string) {
  counter += 1;
  const organizationId = `mail-reply-org-${suffix}-${counter}`;
  const userId = `mail-reply-user-${suffix}-${counter}`;

  await db.organization.create({ data: { id: organizationId, name: "Mail Reply Tenant" } });
  await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "User" } });
  await db.organizationMember.create({ data: { organizationId, userId, role: "MEMBER" } });
  createdOrgs.push(organizationId);
  createdUsers.push(userId);

  if (grantId) {
    await db.integrationConnection.create({
      data: {
        organizationId,
        provider: "NYLAS",
        status: "CONNECTED",
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ grantId, email: "owner@example.test", provider: "google" })
        )
      }
    });
  }

  return { organizationId, userId };
}

afterEach(async () => {
  for (const organizationId of createdOrgs.splice(0)) {
    await db.actionExecution.deleteMany({ where: { organizationId } });
    await db.integrationConnection.deleteMany({ where: { organizationId } });
    await db.organizationMember.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
  for (const id of createdUsers.splice(0)) await db.user.deleteMany({ where: { id } });
});

afterAll(async () => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.$disconnect();
});

const INCOMING = {
  id: "incoming-1",
  thread_id: "thread-1",
  subject: "Teklif hakkında",
  from: [{ name: "Ahmet", email: "ahmet@example.test" }],
  reply_to: [],
  to: [{ email: "owner@example.test" }],
  date: 1_726_500_000
};

describe("mail_send as a reply (recipient and subject from the real message)", () => {
  it("derives recipient and subject from the message, threads the reply, verifies by readback", async () => {
    const { organizationId, userId } = await createOrg("grant-r1");
    const mailbox = createFakeMailbox({ "grant-r1": [INCOMING] });

    const result = await executeMailSend(
      {
        actorUserId: userId,
        organizationId,
        idempotencyKey: "turn:reply-1:mail.send",
        body: "Teşekkürler, cuma günü teslim ederiz.",
        replyToMessageId: "incoming-1"
      },
      mailbox.fetchImpl,
      { sleep: noSleep }
    );

    expect(result).toMatchObject({
      status: "VERIFIED",
      verified: true,
      replayed: false,
      message: { to: "ahmet@example.test", subject: "Re: Teklif hakkında" }
    });
    expect(mailbox.sent).toHaveLength(1);
    expect(mailbox.sent[0]!.payload).toMatchObject({
      to: [{ email: "ahmet@example.test" }],
      subject: "Re: Teklif hakkında",
      reply_to_message_id: "incoming-1"
    });
  });

  it("ignores a caller-supplied recipient/subject: the real message decides", async () => {
    const { organizationId, userId } = await createOrg("grant-r2");
    const mailbox = createFakeMailbox({ "grant-r2": [{ ...INCOMING, reply_to: [{ email: "satis@example.test" }], subject: "Re: Zaten cevap" }] });

    const result = await executeMailSend(
      {
        actorUserId: userId,
        organizationId,
        idempotencyKey: "turn:reply-2:mail.send",
        to: "baskasi@example.test",
        subject: "Başka konu",
        body: "Tamam.",
        replyToMessageId: "incoming-1"
      },
      mailbox.fetchImpl,
      { sleep: noSleep }
    );

    // Reply-To wins over From; an existing "Re:" is not doubled.
    expect(result.message).toEqual({ to: "satis@example.test", subject: "Re: Zaten cevap" });
  });

  it("replying to a message the mailbox owner wrote answers its recipient, not the owner", async () => {
    const { organizationId, userId } = await createOrg("grant-r3");
    const mailbox = createFakeMailbox({
      "grant-r3": [{ ...INCOMING, id: "mine-1", from: [{ email: "Owner@Example.test" }], to: [{ email: "musteri@example.test" }] }]
    });

    const result = await executeMailSend(
      { actorUserId: userId, organizationId, idempotencyKey: "turn:reply-3:mail.send", body: "Hatırlatma.", replyToMessageId: "mine-1" },
      mailbox.fetchImpl,
      { sleep: noSleep }
    );

    expect(result.message.to).toBe("musteri@example.test");
  });

  it("a replayed reply reuses the verified send and never sends twice", async () => {
    const { organizationId, userId } = await createOrg("grant-r4");
    const mailbox = createFakeMailbox({ "grant-r4": [INCOMING] });
    const input = {
      actorUserId: userId,
      organizationId,
      idempotencyKey: "turn:reply-4:mail.send",
      body: "Onay.",
      replyToMessageId: "incoming-1"
    };

    await executeMailSend(input, mailbox.fetchImpl, { sleep: noSleep });
    const again = await executeMailSend(input, mailbox.fetchImpl, { sleep: noSleep });

    expect(again).toMatchObject({ status: "VERIFIED", replayed: true });
    expect(mailbox.sent).toHaveLength(1);
  });

  it("refuses, before any claim or send, when the message is not in this mailbox", async () => {
    const { organizationId, userId } = await createOrg("grant-r5");
    const mailbox = createFakeMailbox({ "grant-r5": [] });

    await expect(
      executeMailSend(
        { actorUserId: userId, organizationId, idempotencyKey: "turn:reply-5:mail.send", body: "Merhaba", replyToMessageId: "ghost" },
        mailbox.fetchImpl,
        { sleep: noSleep }
      )
    ).rejects.toBeInstanceOf(MailReplyTargetNotFoundError);

    expect(mailbox.sent).toHaveLength(0);
    expect(await db.actionExecution.count({ where: { organizationId, actionType: "mail.send" } })).toBe(0);
  });

  it("tenant isolation: cannot reply to another organization's message", async () => {
    await createOrg("grant-a");
    const orgB = await createOrg("grant-b");
    const mailbox = createFakeMailbox({ "grant-a": [{ ...INCOMING, id: "a-only" }], "grant-b": [] });

    await expect(
      executeMailSend(
        { actorUserId: orgB.userId, organizationId: orgB.organizationId, idempotencyKey: "turn:reply-6:mail.send", body: "Sızıntı?", replyToMessageId: "a-only" },
        mailbox.fetchImpl,
        { sleep: noSleep }
      )
    ).rejects.toBeInstanceOf(MailReplyTargetNotFoundError);

    expect(mailbox.sent).toHaveLength(0);
  });

  it("a reply with no mailbox connected is rejected as not connected", async () => {
    const { organizationId, userId } = await createOrg();
    const mailbox = createFakeMailbox({});

    await expect(
      executeMailSend(
        { actorUserId: userId, organizationId, idempotencyKey: "turn:reply-7:mail.send", body: "Merhaba", replyToMessageId: "incoming-1" },
        mailbox.fetchImpl,
        { sleep: noSleep }
      )
    ).rejects.toBeInstanceOf(NylasNotConnectedError);
  });

  it("a plain send still requires an explicit recipient and subject", async () => {
    const { organizationId, userId } = await createOrg("grant-r8");
    const mailbox = createFakeMailbox({ "grant-r8": [] });

    await expect(
      executeMailSend(
        { actorUserId: userId, organizationId, idempotencyKey: "turn:plain-1:mail.send", body: "Merhaba" },
        mailbox.fetchImpl,
        { sleep: noSleep }
      )
    ).rejects.toBeInstanceOf(ZodError);

    expect(mailbox.sent).toHaveLength(0);
  });
});
