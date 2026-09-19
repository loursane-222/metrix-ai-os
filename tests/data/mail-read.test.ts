import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import { OrganizationAccessDeniedError } from "../../src/lib/auth/organization-access";
import { htmlToPlainText, readMail } from "../../src/lib/data/mail-read";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";
import { projectCapabilityResults } from "../../src/lib/presentation/project-result";
import { createFakeMailbox } from "../helpers/fake-mailbox";

const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.NYLAS_CLIENT_ID = "test-client-id";
  process.env.NYLAS_API_KEY = "test-api-key";
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createdOrgs: string[] = [];
const createdUsers: string[] = [];
let counter = 0;

async function createOrg(options: { grantId?: string }) {
  counter += 1;
  const organizationId = `mail-read-org-${suffix}-${counter}`;
  const userId = `mail-read-user-${suffix}-${counter}`;

  await db.organization.create({ data: { id: organizationId, name: "Mail Read Tenant" } });
  await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "User" } });
  await db.organizationMember.create({ data: { organizationId, userId, role: "MEMBER" } });
  createdOrgs.push(organizationId);
  createdUsers.push(userId);

  if (options.grantId) {
    await db.integrationConnection.create({
      data: {
        organizationId,
        provider: "NYLAS",
        status: "CONNECTED",
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ grantId: options.grantId, email: "owner@example.test", provider: "google" })
        )
      }
    });
  }

  return { organizationId, userId };
}

afterEach(async () => {
  for (const organizationId of createdOrgs.splice(0)) {
    await db.customer.deleteMany({ where: { organizationId } });
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

const INVOICE_MAIL = {
  id: "msg-1",
  thread_id: "thread-1",
  subject: "Teklif hakkında",
  from: [{ name: "Ahmet Yılmaz", email: "ahmet@example.test" }],
  to: [{ email: "owner@example.test" }],
  cc: [{ name: "Muhasebe", email: "muhasebe@example.test" }],
  reply_to: [],
  date: 1_726_500_000,
  unread: true,
  snippet: "Merhaba, teklifi inceledik",
  body: "<html><head><style>p{color:red}</style></head><body><p>Merhaba,</p><p>Teklifinizi inceledik.&nbsp;Fiyat &amp; termin uygun.</p><ul><li>Adet: 40</li><li>Teslim: Cuma</li></ul></body></html>"
};

describe("mail_read data (read-only, one full message)", () => {
  it("returns connected:false, not an error, when no mailbox is connected", async () => {
    const { organizationId, userId } = await createOrg({});

    const result = await readMail({ actorUserId: userId, organizationId, messageId: "msg-1" });

    expect(result).toMatchObject({ connected: false, found: false, message: null, thread: [] });
  });

  it("reads the real full message: plain-text body, participants, date and thread context", async () => {
    const { organizationId, userId } = await createOrg({ grantId: "grant-read-1" });
    await db.customer.create({
      data: { organizationId, name: "Ahmet Yılmaz Ltd", email: "AHMET@example.test" }
    });

    const mailbox = createFakeMailbox({
      "grant-read-1": [
        INVOICE_MAIL,
        {
          id: "msg-0",
          thread_id: "thread-1",
          from: [{ email: "owner@example.test" }],
          date: 1_726_400_000,
          snippet: "Teklifimiz ektedir",
          unread: false
        },
        { id: "other-thread", thread_id: "thread-2", from: [{ email: "x@example.test" }], date: 1 }
      ]
    });

    const result = await readMail(
      { actorUserId: userId, organizationId, messageId: "msg-1", timezone: "Europe/Istanbul" },
      mailbox.fetchImpl
    );

    expect(result.connected).toBe(true);
    expect(result.found).toBe(true);
    expect(result.threadVerified).toBe(true);
    expect(result.message).toMatchObject({
      id: "msg-1",
      threadId: "thread-1",
      title: "Teklif hakkında",
      unread: true,
      from: { name: "Ahmet Yılmaz", email: "ahmet@example.test" },
      to: [{ email: "owner@example.test", name: null }],
      cc: [{ email: "muhasebe@example.test", name: "Muhasebe" }],
      bodyTruncated: false,
      matchedCustomerName: "Ahmet Yılmaz Ltd"
    });
    expect(result.message?.body).toContain("Merhaba,");
    expect(result.message?.body).toContain("Fiyat & termin uygun.");
    expect(result.message?.body).toContain("• Adet: 40");
    expect(result.message?.body).not.toMatch(/[<>]|color:red/);
    expect(result.message?.displayDate).toEqual(expect.any(String));

    // Only the OTHER message of the same thread is context.
    expect(result.thread.map(entry => entry.id)).toEqual(["msg-0"]);
  });

  it("keeps a real message readable when its thread cannot be listed, and says so", async () => {
    const { organizationId, userId } = await createOrg({ grantId: "grant-read-2" });
    const mailbox = createFakeMailbox({ "grant-read-2": [INVOICE_MAIL] }, { failThreadList: true });

    const result = await readMail(
      { actorUserId: userId, organizationId, messageId: "msg-1" },
      mailbox.fetchImpl
    );

    expect(result.found).toBe(true);
    expect(result.thread).toEqual([]);
    expect(result.threadVerified).toBe(false);
  });

  it("caps a very long body and flags the cut", async () => {
    const { organizationId, userId } = await createOrg({ grantId: "grant-read-3" });
    const mailbox = createFakeMailbox({
      "grant-read-3": [{ ...INVOICE_MAIL, body: "Uzun satır. ".repeat(3000) }]
    });

    const result = await readMail(
      { actorUserId: userId, organizationId, messageId: "msg-1" },
      mailbox.fetchImpl
    );

    expect(result.message?.bodyTruncated).toBe(true);
    expect(result.message!.body.length).toBeLessThanOrEqual(12_000);
  });

  it("tenant isolation: another organization's message id does not exist in this mailbox", async () => {
    const orgA = await createOrg({ grantId: "grant-a" });
    const orgB = await createOrg({ grantId: "grant-b" });
    const mailbox = createFakeMailbox({
      "grant-a": [{ ...INVOICE_MAIL, id: "secret-a-message" }],
      "grant-b": []
    });

    const result = await readMail(
      { actorUserId: orgB.userId, organizationId: orgB.organizationId, messageId: "secret-a-message" },
      mailbox.fetchImpl
    );

    expect(result).toMatchObject({ connected: true, found: false, message: null });
    // The provider was only ever asked through B's own grant.
    expect(mailbox.requests.every(request => request.grantId === "grant-b")).toBe(true);
    expect(orgA.organizationId).not.toBe(orgB.organizationId);
  });

  it("refuses a user who is not a member of the organization", async () => {
    const { organizationId } = await createOrg({ grantId: "grant-read-4" });
    const outsider = await createOrg({});
    const mailbox = createFakeMailbox({ "grant-read-4": [INVOICE_MAIL] });

    await expect(
      readMail({ actorUserId: outsider.userId, organizationId, messageId: "msg-1" }, mailbox.fetchImpl)
    ).rejects.toBeInstanceOf(OrganizationAccessDeniedError);
    expect(mailbox.requests).toHaveLength(0);
  });

  it("projects to a readable MAIL presentation that carries no provider id", async () => {
    const { organizationId, userId } = await createOrg({ grantId: "grant-read-5" });
    const mailbox = createFakeMailbox({ "grant-read-5": [INVOICE_MAIL] });

    const data = await readMail(
      { actorUserId: userId, organizationId, messageId: "msg-1" },
      mailbox.fetchImpl
    );

    const [presentation] = projectCapabilityResults([
      { capability: "mail_read", operation: "read", data: { source: "COMPANY_REALITY", ...data } }
    ]);

    expect(presentation).toMatchObject({
      type: "MAIL",
      subject: "Teklif hakkında",
      from: "Ahmet Yılmaz <ahmet@example.test>",
      unread: true
    });
    expect(JSON.stringify(presentation)).not.toContain("msg-1");
    expect(JSON.stringify(presentation)).not.toContain("thread-1");
  });
});

describe("htmlToPlainText", () => {
  it("leaves plain text alone and normalizes line endings", () => {
    expect(htmlToPlainText("Merhaba\r\nDünya  ")).toBe("Merhaba\nDünya");
  });

  it("drops scripts/styles, keeps paragraph breaks, decodes entities", () => {
    const text = htmlToPlainText(
      "<div>A&nbsp;&amp;&nbsp;B</div><script>alert(1)</script><p>Satır&#39;ı &#x41;</p><br>Son"
    );

    expect(text).toBe("A & B\nSatır'ı A\n\nSon");
  });
});
