import { listRecentGmailMessages } from "@/lib/integrations/gmail/gmail.service";
import { listUpcomingCalendarEvents } from "@/lib/integrations/google-calendar/google-calendar.service";
import { prisma } from "@/lib/core/shared/prisma";
import type { ConnectorAdapter, ConnectorReadRequest, ConnectorReadResult, ConnectorSourceHealth } from "./types";

const EMAIL_FACT_SCOPE = "email.recentMessages";
const CALENDAR_FACT_SCOPE = "calendar.upcomingEvents";

/**
 * Adapts the existing Gmail (src/lib/integrations/gmail/) and Google
 * Calendar (src/lib/integrations/google-calendar/) read services to the
 * ConnectorAdapter contract. Read-only in this operation — no write is
 * implemented, so write-routing.ts's existing "no non-native write adapter
 * exists" behavior (ROUTE_UNSUPPORTED_CONNECTOR, never a silent fallback)
 * applies unchanged; this file adds no new write path.
 *
 * Both fact scopes share ONE Google OAuth grant/token (GmailConnection —
 * see gmail.service.ts's getValidGoogleAccessToken), never a second
 * credential store. GmailConnection is per-organization *and* per-user
 * (each user connects their own Google account), which the generic
 * ConnectorReadRequest shape (organizationId + factScope only) doesn't
 * carry — the caller passes the connecting user's id via `params.userId`
 * rather than widening the shared Company Intelligence contract for this
 * one connector.
 */
export const googleConnectorAdapter: ConnectorAdapter = {
  provider: "GOOGLE",
  displayName: "Google (Gmail + Calendar)",
  supportedCapabilities: [EMAIL_FACT_SCOPE, CALENDAR_FACT_SCOPE],

  async health(organizationId: string): Promise<ConnectorSourceHealth> {
    const checkedAt = new Date().toISOString();
    const connectedCount = await prisma.gmailConnection.count({ where: { organizationId, status: "CONNECTED" } });
    if (connectedCount > 0) return { status: "HEALTHY", checkedAt };
    return { status: "UNAVAILABLE", checkedAt, detail: "No connected Google account for this organization." };
  },

  async read(request: ConnectorReadRequest): Promise<ConnectorReadResult> {
    const observedAt = new Date().toISOString();
    const userId = typeof request.params?.userId === "string" ? request.params.userId : undefined;
    if (!userId) return { status: "UNSUPPORTED", observedAt };

    if (request.factScope === EMAIL_FACT_SCOPE) {
      const query = typeof request.params?.query === "string" ? request.params.query : undefined;
      const result = await listRecentGmailMessages({ organizationId: request.organizationId, userId, query });
      return mapStatus(result.status, observedAt, result.messages);
    }

    if (request.factScope === CALENDAR_FACT_SCOPE) {
      const result = await listUpcomingCalendarEvents({ organizationId: request.organizationId, userId });
      return mapStatus(result.status, observedAt, result.events);
    }

    return { status: "UNSUPPORTED", observedAt };
  },
};

function mapStatus(status: "OK" | "NOT_CONNECTED" | "RECONNECT_REQUIRED" | "NO_RESULTS" | "UNAVAILABLE", observedAt: string, value: unknown[]): ConnectorReadResult {
  if (status === "OK") return { status: "OK", value, observedAt };
  if (status === "NO_RESULTS") return { status: "OK", value: [], observedAt };
  if (status === "NOT_CONNECTED") return { status: "NOT_FOUND", observedAt };
  // RECONNECT_REQUIRED / UNAVAILABLE: a real, surfaced failure — never
  // silently reported as OK/empty.
  return { status: "UNAVAILABLE", observedAt, errorMessage: status };
}
