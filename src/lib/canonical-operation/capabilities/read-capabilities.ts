import type { CustomerStatus } from "@prisma/client";
import { getCustomerByIdForOrganization, listCustomers } from "@/lib/core/customers/customer.service";
import { findQuoteByIdForOrganization, listQuotesByOrganization } from "@/lib/core/quotes/quote.service";
import { getOrderByIdForOrganization, listOrders } from "@/lib/core/orders/order.service";
import { findInvoiceById, listInvoices } from "@/lib/core/invoices/invoice.service";
import { findTaskById, listTasks } from "@/lib/core/tasks/task.service";
import { getStockByIdForOrganization, listStock } from "@/lib/core/stock/stock.service";
import { getCalendarEvent, listCalendarEvents } from "@/lib/core/calendar/calendar-event.service";
import { listOrganizationMembers } from "@/lib/core/organization-members/organization-member.service";
import { registerCapability, type CapabilityDescriptor } from "../capability-registry";

/**
 * READ capabilities for the representative business domains. Each wraps a
 * real, existing src/lib/core/<domain> service function — no new query
 * logic, no Prisma access here. `read` is the paired existence/state check
 * native-connector.ts uses for post-write readback (see verifyExpectedState
 * on the matching WRITE capability).
 */
const readDescriptors: CapabilityDescriptor[] = [
  {
    capabilityId: "customer.read",
    domain: "customer",
    classification: "READ",
    implementation: {
      kind: "READ",
      read: async (organizationId, entityId) =>
        (await getCustomerByIdForOrganization(entityId, organizationId)) as Record<string, unknown> | null,
      search: async (organizationId, payload) =>
        listCustomers({ organizationId, status: payload.status as CustomerStatus | undefined }),
    },
  },
  {
    capabilityId: "quote.read",
    domain: "quote",
    classification: "READ",
    implementation: {
      kind: "READ",
      read: async (organizationId, entityId) =>
        (await findQuoteByIdForOrganization(entityId, organizationId)) as Record<string, unknown> | null,
      search: async (organizationId, payload) =>
        listQuotesByOrganization({ organizationId, status: payload.status as never }),
    },
  },
  {
    capabilityId: "order.read",
    domain: "order",
    classification: "READ",
    implementation: {
      kind: "READ",
      read: async (organizationId, entityId) =>
        (await getOrderByIdForOrganization(entityId, organizationId)) as Record<string, unknown> | null,
      search: async (organizationId, payload) =>
        listOrders({ organizationId, status: payload.status as never, customerId: payload.customerId as string | undefined }),
    },
  },
  {
    capabilityId: "invoice.read",
    domain: "invoice",
    classification: "READ",
    implementation: {
      kind: "READ",
      read: async (organizationId, entityId) =>
        (await findInvoiceById(entityId, organizationId)) as Record<string, unknown> | null,
      search: async (organizationId) => listInvoices(organizationId),
    },
  },
  {
    capabilityId: "task.read",
    domain: "task",
    classification: "READ",
    implementation: {
      kind: "READ",
      read: async (organizationId, entityId) =>
        (await findTaskById(entityId, organizationId)) as Record<string, unknown> | null,
      search: async (organizationId, payload) =>
        listTasks({ organizationId, status: payload.status as never }),
    },
  },
  {
    capabilityId: "inventory.position",
    domain: "stock",
    classification: "READ",
    implementation: {
      kind: "READ",
      read: async (organizationId, entityId) =>
        (await getStockByIdForOrganization(entityId, organizationId)) as unknown as Record<string, unknown> | null,
      search: async (organizationId, payload) =>
        listStock({ organizationId, warehouseId: payload.warehouseId as string | undefined, productServiceId: payload.productServiceId as string | undefined, status: payload.status as never }),
    },
  },
  {
    capabilityId: "calendar.read",
    domain: "calendar",
    classification: "READ",
    implementation: {
      kind: "READ",
      read: async (organizationId, entityId) =>
        (await getCalendarEvent(entityId, organizationId)) as unknown as Record<string, unknown> | null,
      search: async (organizationId, payload) =>
        listCalendarEvents({
          organizationId,
          rangeStart: new Date(payload.rangeStart as string),
          rangeEnd: new Date(payload.rangeEnd as string),
        }),
    },
  },
  {
    capabilityId: "team.read",
    domain: "team",
    classification: "READ",
    implementation: {
      kind: "READ",
      read: async (organizationId, entityId) => {
        const members = await listOrganizationMembers(organizationId);
        const member = members.find((candidate) => candidate.id === entityId);
        return (member as unknown as Record<string, unknown> | undefined) ?? null;
      },
      search: async (organizationId) => listOrganizationMembers(organizationId),
    },
  },
];

export function registerReadCapabilities(): void {
  for (const descriptor of readDescriptors) registerCapability(descriptor);
}
