import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "../../src/lib/db";
import { searchMail } from "../../src/lib/data/mail-search";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";
import { projectCapabilityResults } from "../../src/lib/presentation/project-result";
import type { FetchLike } from "../../src/lib/integrations/nylas/nylas-client";

const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.NYLAS_CLIENT_ID = "test-client-id";
  process.env.NYLAS_API_KEY = "test-api-key";
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
});

function okFetch(body: unknown): FetchLike {
  return async () => ({ ok: true, status: 200, json: async () => body });
}

describe("mail search (read-only)", () => {
  it("returns connected:false with no messages when no mailbox is connected", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-noconn`;
    const organizationId = `mail-search-noconn-org-${suffix}`;
    const userId = `mail-search-noconn-user-${suffix}`;

    await db.organization.create({ data: { id: organizationId, name: "No Mailbox" } });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });

    try {
      const result = await searchMail({ actorUserId: userId, organizationId });
      expect(result).toEqual({ connected: false, connectedEmail: null, messages: [] });
    } finally {
      await db.organizationMember.deleteMany({ where: { organizationId } });
      await db.user.deleteMany({ where: { id: userId } });
      await db.organization.deleteMany({ where: { id: organizationId } });
    }
  });

  it("deterministically links a message's sender to a real Customer by exact email", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-match`;
    const organizationId = `mail-search-match-org-${suffix}`;
    const userId = `mail-search-match-user-${suffix}`;
    const customerId = `mail-search-customer-${suffix}`;

    await db.organization.create({ data: { id: organizationId, name: "Match Tenant" } });
    await db.user.create({
      data: { id: userId, email: `${userId}@example.test`, name: "User" }
    });
    await db.organizationMember.create({
      data: { organizationId, userId, role: "MEMBER" }
    });
    await db.customer.create({
      data: { id: customerId, organizationId, name: "ABC Mermer", email: "abc@example.test" }
    });
    await db.integrationConnection.create({
      data: {
        organizationId,
        provider: "NYLAS",
        status: "CONNECTED",
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ grantId: "grant-1", email: "owner@example.test", provider: "google" })
        )
      }
    });

    try {
      const result = await searchMail(
        { actorUserId: userId, organizationId },
        okFetch({
          data: [
            {
              id: "m1",
              subject: "Teklif hakkında",
              from: [{ name: "ABC Mermer", email: "abc@example.test" }],
              date: 1_726_500_000,
              snippet: "Teklifi inceledik...",
              unread: true
            },
            {
              id: "m2",
              subject: "Tanımadığımız biri",
              from: [{ name: "Bilinmeyen", email: "bilinmeyen@example.test" }],
              date: 1_726_400_000,
              snippet: "Merhaba",
              unread: false
            }
          ]
        })
      );

      expect(result.connected).toBe(true);
      expect(result.connectedEmail).toBe("owner@example.test");
      expect(result.messages).toHaveLength(2);

      const matched = result.messages.find(m => m.id === "m1");
      expect(matched).toMatchObject({
        subject: "Teklif hakkında",
        fromEmail: "abc@example.test",
        matchedCustomerId: customerId,
        matchedCustomerName: "ABC Mermer"
      });

      const unmatched = result.messages.find(m => m.id === "m2");
      expect(unmatched?.matchedCustomerId).toBeNull();
    } finally {
      await db.integrationConnection.deleteMany({ where: { organizationId } });
      await db.customer.deleteMany({ where: { organizationId } });
      await db.organizationMember.deleteMany({ where: { organizationId } });
      await db.user.deleteMany({ where: { id: userId } });
      await db.organization.deleteMany({ where: { id: organizationId } });
    }
  });
});

// Nylas v3 message shape, as documented at developer.nylas.com/docs/v3/email/messages:
// `from` is [{ name, email }], `date` is Unix seconds, list results carry
// `snippet` (not `body`). Provider ids below are deliberately opaque, like
// the real Gmail-backed ids that leaked into the LIST in the live run.
function providerMessage(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `1a0b5c19ed1c10${index.toString(16).padStart(2, "0")}`,
    object: "message",
    grant_id: "grant-1",
    subject: `Konu ${index}`,
    from: [{ name: `Gönderen ${index}`, email: `gonderen${index}@example.test` }],
    date: 1_726_500_000 - index * 60,
    snippet: `Önizleme ${index}`,
    unread: index % 2 === 0,
    ...overrides
  };
}

async function withConnectedMailbox<T>(
  label: string,
  run: (ctx: { organizationId: string; userId: string }) => Promise<T>
): Promise<T> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}-${label}`;
  const organizationId = `mail-real-org-${suffix}`;
  const userId = `mail-real-user-${suffix}`;

  await db.organization.create({ data: { id: organizationId, name: "Mail Reality" } });
  await db.user.create({
    data: { id: userId, email: `${userId}@example.test`, name: "User" }
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
        JSON.stringify({ grantId: "grant-1", email: "owner@example.test", provider: "google" })
      )
    }
  });

  try {
    return await run({ organizationId, userId });
  } finally {
    await db.integrationConnection.deleteMany({ where: { organizationId } });
    await db.organizationMember.deleteMany({ where: { organizationId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }
}

describe("mail search — explicit limit and human-readable normalization", () => {
  it("limit=5 reaches the provider request and caps the canonical output at 5 even if the provider over-returns", async () => {
    await withConnectedMailbox("limit5", async ({ organizationId, userId }) => {
      const urls: string[] = [];
      const overReturning: FetchLike = async url => {
        urls.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: Array.from({ length: 12 }, (_, i) => providerMessage(i + 1))
          })
        };
      };

      const result = await searchMail(
        { actorUserId: userId, organizationId, limit: 5 },
        overReturning
      );

      expect(urls[0]).toContain("limit=5");
      expect(result.messages).toHaveLength(5);
      // newest-first order from the provider is preserved: the 5 kept are the first 5
      expect(result.messages.map(m => m.subject)).toEqual([
        "Konu 1",
        "Konu 2",
        "Konu 3",
        "Konu 4",
        "Konu 5"
      ]);
    });
  });

  it("keeps the existing default of 20 when no limit is given", async () => {
    await withConnectedMailbox("default", async ({ organizationId, userId }) => {
      const urls: string[] = [];
      const fetchImpl: FetchLike = async url => {
        urls.push(url);
        return { ok: true, status: 200, json: async () => ({ data: [] }) };
      };

      await searchMail({ actorUserId: userId, organizationId }, fetchImpl);

      expect(urls[0]).toContain("limit=20");
    });
  });

  it("maps sender, subject, date and preview into a human-readable title/subtitle while keeping the provider id as internal metadata only", async () => {
    await withConnectedMailbox("normalize", async ({ organizationId, userId }) => {
      const message = providerMessage(1, {
        subject: "Teklif hakkında",
        from: [{ name: "ABC Mermer", email: "abc@example.test" }],
        date: 1_726_500_000,
        snippet: "Teklifi   inceledik,\n\n yarın döneriz."
      });

      const result = await searchMail(
        { actorUserId: userId, organizationId, timezone: "Europe/Istanbul" },
        okFetch({ data: [message] })
      );

      const [item] = result.messages;
      expect(item).toMatchObject({
        id: message.id,
        title: "Teklif hakkında",
        subject: "Teklif hakkında",
        fromName: "ABC Mermer",
        fromEmail: "abc@example.test",
        date: "2024-09-16T15:20:00.000Z",
        snippet: "Teklifi   inceledik,\n\n yarın döneriz."
      });
      // 15:20Z is 18:20 in Istanbul (UTC+3); whitespace in the preview is collapsed.
      expect(item!.subtitle).toBe(
        "ABC Mermer · 16 Eyl 2024 18:20 · Teklifi inceledik, yarın döneriz."
      );
      expect(item!.title).not.toBe(item!.id);
      expect(item!.subtitle).not.toContain(item!.id);
    });
  });

  it("truncates a long preview and falls back to UTC for an unknown timezone instead of throwing", async () => {
    await withConnectedMailbox("truncate", async ({ organizationId, userId }) => {
      const result = await searchMail(
        { actorUserId: userId, organizationId, timezone: "Not/AZone" },
        okFetch({ data: [providerMessage(1, { snippet: "x".repeat(300) })] })
      );

      const subtitle = result.messages[0]!.subtitle!;
      expect(subtitle).toContain("15:19");
      expect(subtitle.endsWith("…")).toBe(true);
      expect(subtitle.length).toBeLessThan(140);
    });
  });

  it("never invents missing fields: no subject gets a fixed placeholder title, no sender/date/preview gives a null subtitle", async () => {
    await withConnectedMailbox("missing", async ({ organizationId, userId }) => {
      const bare = { id: "1a0b5c0c30ad8dc8", object: "message" };

      const result = await searchMail(
        { actorUserId: userId, organizationId },
        okFetch({
          data: [
            bare,
            { ...bare, id: "second", subject: "   ", from: [], snippet: "  " },
            { ...bare, id: "third", from: [{ email: "only@example.test" }] }
          ]
        })
      );

      expect(result.messages[0]).toMatchObject({
        id: "1a0b5c0c30ad8dc8",
        title: "(Konu yok)",
        subtitle: null,
        subject: null,
        fromEmail: null,
        fromName: null,
        date: null,
        snippet: null
      });
      expect(result.messages[1]).toMatchObject({ title: "(Konu yok)", subtitle: null });
      // email-only sender is shown as the email, nothing else is fabricated
      expect(result.messages[2]!.subtitle).toBe("only@example.test");
    });
  });

  it("projects exactly 5 LIST rows whose visible text is never a raw provider id", async () => {
    await withConnectedMailbox("presentation", async ({ organizationId, userId }) => {
      const messages = Array.from({ length: 12 }, (_, i) => providerMessage(i + 1));

      const result = await searchMail(
        { actorUserId: userId, organizationId, limit: 5, timezone: "Europe/Istanbul" },
        okFetch({ data: messages })
      );

      const [presentation] = projectCapabilityResults([
        {
          capability: "mail_search",
          operation: "read",
          data: { source: "COMPANY_REALITY", ...result }
        }
      ]);

      expect(presentation?.type).toBe("LIST");
      if (presentation?.type !== "LIST") return;

      expect(presentation.title).toBe("E-postalar");
      expect(presentation.metrics).toEqual([{ label: "Kayıt", value: "5" }]);
      expect(presentation.rows).toHaveLength(5);

      const providerIds = new Set(messages.map(m => m.id));
      presentation.rows.forEach((row, index) => {
        expect(row.primary).toBe(`Konu ${index + 1}`);
        expect(providerIds.has(row.primary)).toBe(false);
        expect(row.secondary).toContain(`Gönderen ${index + 1}`);
        expect(row.secondary).toContain(`Önizleme ${index + 1}`);
        expect(providerIds.has(row.secondary ?? "")).toBe(false);
        // the internal id stays available on the row itself, never as its label
        expect(row.id).toBe(messages[index]!.id);
      });
    });
  });
});

afterAll(async () => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.$disconnect();
});
