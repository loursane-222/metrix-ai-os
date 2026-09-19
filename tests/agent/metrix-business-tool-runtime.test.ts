import {
  afterAll,
  describe,
  expect,
  it
} from "vitest";

import {
  db
} from "../../src/lib/db";

import {
  executeMetrixBusinessTool,
  METRIX_RESPONSES_FUNCTION_TOOLS,
  type MetrixTrustedToolContext
} from "../../src/lib/agent/tools/metrix-business-tool-runtime";

const suffix =
  `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

const organizationId =
  `business-runtime-org-${suffix}`;

const actorUserId =
  `business-runtime-user-${suffix}`;

const context: MetrixTrustedToolContext = {
  actorUserId,
  organizationId,
  idempotencyScope:
    `business-runtime-call-${suffix}`,
  timezone: "Europe/Istanbul",
  referenceTimeIso:
    "2026-09-13T17:32:28.860Z"
};

describe(
  "METRIX business tool runtime",
  () => {
    it(
      "publishes shared model-owned business and calendar contracts without trusted fields",
      () => {
        expect(
          METRIX_RESPONSES_FUNCTION_TOOLS.map(
            (tool) => tool.name
          )
        ).toEqual([
          "task_create",
          "task_list",
          "task_update",
          "calendar_list",
          "calendar_create",
          "calendar_update",
          "mail_search",
          "mail_read",
          "mail_send",
          "integration_status",
          "integration_connect",
          "integration_disconnect",
          "customer_create",
          "customer_lookup",
          "customer_update",
          "product_service_lookup",
          "quote_create",
          "quote_lookup",
          "quote_update",
          "quote_mark_won",
          "order_create_from_quote",
          "order_lookup",
          "invoice_create_from_order",
          "invoice_lookup",
          "invoice_receivable_lookup",
          "receivables_summary",
          "sales_summary",
          "collection_record",
          "collection_lookup",
          "location_create",
          "location_lookup",
          "supplier_create",
          "supplier_lookup",
          "purchase_record",
          "inventory_transfer",
          "transformation_record",
          "inventory_lookup",
          "document_generate",
          "approval_request",
          "approval_resolve",
          "approval_list",
          "notification_create",
          "notification_mark_read",
          "notification_list"
        ]);

        expect(
          JSON.stringify(
            METRIX_RESPONSES_FUNCTION_TOOLS
          )
        ).not.toMatch(
          /actorUserId|organizationId|idempotencyKey|referenceTimeIso/
        );
      }
    );

    it(
      "dispatches task creation through the verified action with trusted context",
      async () => {
        await db.organization.create({
          data: {
            id: organizationId,
            name: "Business Runtime Org"
          }
        });

        await db.user.create({
          data: {
            id: actorUserId,
            email: `${actorUserId}@example.test`,
            name: "Business Runtime User"
          }
        });

        await db.organizationMember.create({
          data: {
            organizationId,
            userId: actorUserId,
            role: "MEMBER"
          }
        });

        const result =
          await executeMetrixBusinessTool({
            name: "task_create",
            argumentsJson: JSON.stringify({
              title: "Tahsilatı kontrol et",
              priority: "HIGH"
            }),
            context
          });

        expect(result).toMatchObject({
          action: "task.create",
          status: "VERIFIED",
          verified: true,
          replayed: false
        });

        const execution =
          await db.actionExecution.findUnique({
            where: {
              organizationId_actionType_idempotencyKey: {
                organizationId,
                actionType: "task.create",
                idempotencyKey:
                  `${context.idempotencyScope}:task.create`
              }
            }
          });

        expect(execution?.status).toBe("VERIFIED");
      }
    );

    it(
      "dispatches task_list as a grounded company-reality read",
      async () => {
        const listContext: MetrixTrustedToolContext = {
          ...context,
          idempotencyScope:
            `${context.idempotencyScope}-list`
        };

        const created =
          await executeMetrixBusinessTool({
            name: "task_create",
            argumentsJson: JSON.stringify({
              title: "Listelenecek görev",
              priority: "LOW"
            }),
            context: listContext
          });

        expect(created).toMatchObject({
          status: "VERIFIED"
        });

        const result =
          (await executeMetrixBusinessTool({
            name: "task_list",
            argumentsJson: JSON.stringify({
              titleContains: "Listelenecek"
            }),
            context: listContext
          })) as {
            source: string;
            count: number;
            tasks: Array<{ title: string }>;
          };

        expect(result.source).toBe(
          "COMPANY_REALITY"
        );

        expect(result.count).toBe(1);

        expect(result.tasks[0]?.title).toBe(
          "Listelenecek görev"
        );
      }
    );

    it(
      "dispatches task_update as a verified mutation with a per-task idempotency key",
      async () => {
        const updateContext: MetrixTrustedToolContext = {
          ...context,
          idempotencyScope:
            `${context.idempotencyScope}-update`
        };

        const created =
          (await executeMetrixBusinessTool({
            name: "task_create",
            argumentsJson: JSON.stringify({
              title: "Güncellenecek görev",
              priority: "LOW"
            }),
            context: updateContext
          })) as {
            task: { id: string };
          };

        const taskId = created.task.id;

        const result =
          await executeMetrixBusinessTool({
            name: "task_update",
            argumentsJson: JSON.stringify({
              taskId,
              status: "DONE"
            }),
            context: updateContext
          });

        expect(result).toMatchObject({
          action: "task.update",
          status: "VERIFIED",
          verified: true,
          replayed: false
        });

        const execution =
          await db.actionExecution.findUnique({
            where: {
              organizationId_actionType_idempotencyKey: {
                organizationId,
                actionType: "task.update",
                idempotencyKey:
                  `${updateContext.idempotencyScope}:task.update:${taskId}`
              }
            }
          });

        expect(execution?.status).toBe(
          "VERIFIED"
        );
      }
    );

    it(
      "dispatches calendar_list unaffected when the organization has no connected mailbox (external merge is a graceful no-op)",
      async () => {
        const calendarContext: MetrixTrustedToolContext = {
          ...context,
          idempotencyScope: `${context.idempotencyScope}-calendar`
        };

        const created = (await executeMetrixBusinessTool({
          name: "calendar_create",
          argumentsJson: JSON.stringify({
            title: "Yerel toplantı",
            startsAt: "2026-09-20T10:00:00.000Z",
            endsAt: "2026-09-20T11:00:00.000Z"
          }),
          context: calendarContext
        })) as { event: { id: string } };

        const result = (await executeMetrixBusinessTool({
          name: "calendar_list",
          argumentsJson: JSON.stringify({ mode: "DAY" }),
          context: calendarContext
        })) as { events: Array<{ id: string }> };

        expect(
          result.events.some(event => event.id === created.event.id)
        ).toBe(true);
        expect(result.events.every(event => !event.id.startsWith("nylas:"))).toBe(
          true
        );
      }
    );
  }
);

afterAll(async () => {
  await db.actionExecution.deleteMany({
    where: {
      organizationId
    }
  });

  await db.task.deleteMany({
    where: {
      organizationId
    }
  });

  await db.calendarEvent.deleteMany({
    where: {
      organizationId
    }
  });

  await db.organizationMember.deleteMany({
    where: {
      organizationId
    }
  });

  await db.organization.deleteMany({
    where: {
      id: organizationId
    }
  });

  await db.user.deleteMany({
    where: {
      id: actorUserId
    }
  });

  await db.$disconnect();
});
