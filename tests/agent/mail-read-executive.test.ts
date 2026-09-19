import { describe, expect, it } from "vitest";

import {
  METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS,
  METRIX_SYSTEM_EVENT_INSTRUCTIONS,
  buildMetrixExecutiveBackendInstructions
} from "../../src/lib/agent/metrix-executive-contract";
import {
  MailReadToolParameters,
  MailSendToolParameters
} from "../../src/lib/agent/tools/metrix-business-tool-runtime";
import { projectCapabilityResults } from "../../src/lib/presentation/project-result";

describe("mail_read / reply executive contract", () => {
  it("teaches the Executive to open, read and answer about a mail from real content, and to reply through mail_send by message id", () => {
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("mail_read");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("en son açtığın (mail_read)");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("replyToMessageId");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("GÜVENİLMEYEN");
    // Existing mail contract is intact.
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("kullanıcıya asla gösterme");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("altyapı sağlayıcısının adını söyleme");
  });

  it("mail_read takes only a message id; mail_send accepts a reply by id with no recipient/subject", () => {
    expect(MailReadToolParameters.safeParse({ messageId: "abc" }).success).toBe(true);
    expect(MailReadToolParameters.safeParse({}).success).toBe(false);

    expect(
      MailSendToolParameters.safeParse({ body: "Tamam.", replyToMessageId: "abc" }).success
    ).toBe(true);
    // A plain send with the old fields still parses.
    expect(
      MailSendToolParameters.safeParse({ to: "a@example.test", subject: "Merhaba", body: "Selam" }).success
    ).toBe(true);
  });
});

describe("mail presentations", () => {
  const listData = {
    source: "COMPANY_REALITY",
    connected: true,
    connectedEmail: "owner@example.test",
    messages: [
      {
        id: "provider-id-1",
        title: "Teklif hakkında",
        subtitle: "Ahmet · 16 Eyl · Merhaba",
        subject: "Teklif hakkında",
        fromEmail: "ahmet@example.test",
        fromName: "Ahmet Yılmaz",
        date: "2026-09-16T10:00:00.000Z",
        snippet: "Merhaba",
        unread: true,
        matchedCustomerId: null,
        matchedCustomerName: null
      },
      {
        id: "provider-id-2",
        title: "(Konu yok)",
        subtitle: null,
        subject: null,
        fromEmail: "x@example.test",
        fromName: null,
        date: null,
        snippet: null,
        unread: false,
        matchedCustomerId: null,
        matchedCustomerName: null
      }
    ]
  };

  it("mail_search rows show unread state and ask to be opened by subject and sender, never by provider id", () => {
    const [view] = projectCapabilityResults([
      { capability: "mail_search", operation: "read", data: listData }
    ]);

    expect(view).toMatchObject({ type: "LIST", title: "E-postalar" });

    const rows = (view as { rows: Array<{ unread?: boolean; prompt?: string; primary: string }> }).rows;

    expect(rows[0]).toMatchObject({
      primary: "Teklif hakkında",
      unread: true,
      prompt: 'Şu maili aç: "Teklif hakkında" — Ahmet Yılmaz'
    });
    expect(rows[1]!.unread).toBeUndefined();
    expect(rows[1]!.prompt).toContain("x@example.test");
    for (const row of rows) expect(row.prompt).not.toContain("provider-id");
  });

  it("a turn that searches and then opens a mail presents the opened mail", () => {
    const presentations = projectCapabilityResults([
      { capability: "mail_search", operation: "read", data: listData },
      {
        capability: "mail_read",
        operation: "read",
        data: {
          source: "COMPANY_REALITY",
          connected: true,
          found: true,
          threadVerified: true,
          thread: [{ id: "t1" }, { id: "t2" }],
          message: {
            id: "provider-id-1",
            title: "Teklif hakkında",
            from: { name: "Ahmet Yılmaz", email: "ahmet@example.test" },
            to: [{ name: null, email: "owner@example.test" }],
            displayDate: "16 Eyl 2026 13:00",
            unread: true,
            body: "Merhaba,\n\nTeklifi inceledik.",
            bodyTruncated: false
          }
        }
      }
    ]);

    expect(presentations).toHaveLength(1);
    expect(presentations[0]).toEqual({
      type: "MAIL",
      title: "E-posta",
      subject: "Teklif hakkında",
      from: "Ahmet Yılmaz <ahmet@example.test>",
      to: "owner@example.test",
      date: "16 Eyl 2026 13:00",
      unread: true,
      body: "Merhaba,\n\nTeklifi inceledik.",
      bodyTruncated: false,
      threadCount: 2
    });
  });

  it("mail_read that found nothing produces no presentation", () => {
    expect(
      projectCapabilityResults([
        {
          capability: "mail_read",
          operation: "read",
          data: { source: "COMPANY_REALITY", connected: true, found: false, message: null, thread: [] }
        }
      ])
    ).toEqual([]);
  });
});

describe("SYSTEM_EVENT origin (same Executive, narrowed)", () => {
  it("adds the system-event instructions only for a server-originated turn", () => {
    const temporal = { timezone: "Europe/Istanbul", referenceTimeIso: "2026-09-19T12:00:00.000Z" };

    expect(buildMetrixExecutiveBackendInstructions(temporal)).not.toContain(
      METRIX_SYSTEM_EVENT_INSTRUCTIONS
    );
    expect(buildMetrixExecutiveBackendInstructions(temporal, { origin: "USER" })).not.toContain(
      "SİSTEM OLAYI"
    );

    const withEvent = buildMetrixExecutiveBackendInstructions(temporal, { origin: "SYSTEM_EVENT" });
    expect(withEvent).toContain(METRIX_SYSTEM_EVENT_INSTRUCTIONS);
    expect(withEvent).toContain("KULLANICI MESAJI DEĞİL");
    expect(withEvent).toContain("Gürültü üretme");
    expect(withEvent).toContain("Reference time: 2026-09-19T12:00:00.000Z");
  });

  it("the system-event Executive is the same METRIX agent with read tools plus the one notification — no business mutation, no connect flow", async () => {
    const { createMetrixExecutiveAgent } = await import("../../src/lib/agent/metrix-executive-agent");
    const temporal = { timezone: "Europe/Istanbul", referenceTimeIso: "2026-09-19T12:00:00.000Z" };

    const user = createMetrixExecutiveAgent(temporal);
    const event = createMetrixExecutiveAgent(temporal, { origin: "SYSTEM_EVENT" });

    expect(event.name).toBe("METRIX");
    expect((event as { model?: unknown }).model).toBe((user as { model?: unknown }).model);

    const eventTools = event.tools.map(tool => tool.name);

    expect(eventTools).toEqual(expect.arrayContaining(["task_list", "calendar_list", "mail_search", "mail_read", "notification_create"]));

    for (const forbidden of [
      "mail_send", "task_create", "task_update", "calendar_create", "calendar_update",
      "customer_create", "customer_update", "quote_create", "quote_update", "quote_mark_won",
      "order_create_from_quote", "invoice_create_from_order", "collection_record", "location_create",
      "supplier_create", "purchase_record", "inventory_transfer", "transformation_record",
      "document_generate", "approval_request", "approval_resolve", "notification_mark_read",
      "integration_connect", "integration_disconnect"
    ]) {
      expect(eventTools).not.toContain(forbidden);
    }

    // Every tool the event run has exists on the one full toolset.
    const userTools = new Set(user.tools.map(tool => tool.name));
    for (const name of eventTools) expect(userTools.has(name)).toBe(true);
  });
});
