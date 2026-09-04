import { listIcloudCalendarEventsInRange } from "@/lib/integrations/icloud-calendar/icloud-calendar.service";
import { prisma } from "@/lib/core/shared/prisma";
import type { ConnectorAdapter, ConnectorReadRequest, ConnectorReadResult, ConnectorSourceHealth } from "./types";

const CALENDAR_RANGE_FACT_SCOPE = "calendar.range";

/**
 * Adapts the CalDAV-backed iCloud Calendar read service to the
 * ConnectorAdapter contract — mirrors google-connector-adapter.ts. Read-only
 * (no write implemented): write-routing.ts's existing "no non-native write
 * adapter exists" behavior applies unchanged. IcloudConnection is per
 * (organizationId, userId) — each user connects their own iCloud account —
 * so the caller passes the connecting user's id via `params.userId`, same
 * convention the Google adapter already uses.
 */
export const icloudConnectorAdapter: ConnectorAdapter = {
  provider: "ICLOUD",
  displayName: "iCloud Calendar",
  supportedCapabilities: [CALENDAR_RANGE_FACT_SCOPE],

  async health(organizationId: string): Promise<ConnectorSourceHealth> {
    const checkedAt = new Date().toISOString();
    const connectedCount = await prisma.icloudConnection.count({ where: { organizationId, status: "CONNECTED" } });
    if (connectedCount > 0) return { status: "HEALTHY", checkedAt };
    return { status: "UNAVAILABLE", checkedAt, detail: "No connected iCloud account for this organization." };
  },

  async read(request: ConnectorReadRequest): Promise<ConnectorReadResult> {
    const observedAt = new Date().toISOString();
    const userId = typeof request.params?.userId === "string" ? request.params.userId : undefined;
    if (!userId) return { status: "UNSUPPORTED", observedAt };
    if (request.factScope !== CALENDAR_RANGE_FACT_SCOPE) return { status: "UNSUPPORTED", observedAt };

    const rangeStart = typeof request.params?.rangeStart === "string" ? request.params.rangeStart : undefined;
    const rangeEnd = typeof request.params?.rangeEnd === "string" ? request.params.rangeEnd : undefined;
    if (!rangeStart || !rangeEnd) return { status: "UNSUPPORTED", observedAt };

    const result = await listIcloudCalendarEventsInRange({ organizationId: request.organizationId, userId, rangeStart, rangeEnd });
    return mapStatus(result.status, observedAt, result.events);
  },
};

function mapStatus(status: "OK" | "NOT_CONNECTED" | "AUTH_REQUIRED" | "NO_RESULTS" | "UNAVAILABLE", observedAt: string, value: unknown[]): ConnectorReadResult {
  if (status === "OK") return { status: "OK", value, observedAt };
  if (status === "NO_RESULTS") return { status: "OK", value: [], observedAt };
  if (status === "NOT_CONNECTED") return { status: "NOT_FOUND", observedAt };
  // AUTH_REQUIRED / UNAVAILABLE: a real, surfaced failure — never silently
  // reported as OK/empty (rule: a revoked/failed credential degrades
  // coverage honestly, never masquerades as an empty-but-complete calendar).
  return { status: "UNAVAILABLE", observedAt, errorMessage: status };
}
