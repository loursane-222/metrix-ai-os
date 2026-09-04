import { prisma } from "@/lib/core/shared/prisma";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../integration-secret-crypto";
import { discoverCalDAVHome, listCalendarCollections, queryEventsInRange } from "./caldav-client";
import type { IcloudCalendarEventSource, IcloudCalendarRetrievalContext, IcloudConnectionStatus } from "./icloud-calendar.types";

const MAX_RANGE_EVENTS = 50;

/**
 * Discovery IS the credential verification — never persist an app-specific
 * password that can't actually reach the CalDAV server. Never accepts or
 * stores the user's primary Apple Account password: this only ever writes
 * whatever string the caller passes as `appSpecificPassword` into the same
 * AES-256-GCM encrypted-secret column every other manual-credential
 * integration (e.g. BizimHesap) already uses — no separate "is this really
 * an app-specific password" check exists because Apple's own app-specific
 * passwords are the only credential CalDAV Basic Auth will accept from a
 * 2FA-protected Apple Account in the first place (a primary password is
 * rejected by Apple's own server with 401, surfaced here as
 * ICLOUD_AUTH_REQUIRED before anything is ever stored).
 */
export async function connectIcloudCalendar(input: { organizationId: string; userId: string; appleId: string; appSpecificPassword: string }): Promise<void> {
  const appleId = input.appleId.trim().toLowerCase();
  const appSpecificPassword = input.appSpecificPassword.trim();
  if (!appleId || !appSpecificPassword) throw new Error("ICLOUD_CREDENTIALS_MISSING");

  const discovery = await discoverCalDAVHome(appleId, appSpecificPassword);
  if (discovery.status === "AUTH_REQUIRED") throw new Error("ICLOUD_AUTH_REQUIRED");
  if (discovery.status !== "OK") throw new Error(`ICLOUD_DISCOVERY_${discovery.status}`);

  const appSpecificPasswordEncrypted = encryptIntegrationSecret(appSpecificPassword);
  await prisma.icloudConnection.upsert({
    where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } },
    create: { organizationId: input.organizationId, userId: input.userId, appleId, appSpecificPasswordEncrypted, caldavPrincipalUrl: discovery.principalUrl, caldavHomeSetUrl: discovery.homeSetUrl },
    update: { appleId, appSpecificPasswordEncrypted, caldavPrincipalUrl: discovery.principalUrl, caldavHomeSetUrl: discovery.homeSetUrl, status: "CONNECTED", connectedAt: new Date(), lastErrorAt: null, lastErrorCode: null },
  });
}

export async function getIcloudCalendarStatus(organizationId: string, userId: string): Promise<IcloudConnectionStatus> {
  const row = await prisma.icloudConnection.findUnique({ where: { organizationId_userId: { organizationId, userId } } });
  if (!row) return { connected: false, appleId: null, readOnly: true, status: "NOT_CONNECTED", connectedAt: null, lastSuccessfulAccessAt: null, lastErrorCode: null };
  return {
    connected: row.status === "CONNECTED",
    appleId: row.appleId,
    readOnly: true,
    status: row.status === "CONNECTED" ? "CONNECTED" : row.status === "AUTH_REQUIRED" ? "AUTH_REQUIRED" : "ERROR",
    connectedAt: row.connectedAt.toISOString(),
    lastSuccessfulAccessAt: row.lastSuccessfulAccessAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
  };
}

export async function disconnectIcloudCalendar(organizationId: string, userId: string): Promise<void> {
  await prisma.icloudConnection.deleteMany({ where: { organizationId, userId } });
}

function toEventSource(record: { uid: string; calendarUrl: string; summary: string; description: string; startAt: string; endAt: string; allDay: boolean; status: "CONFIRMED" | "CANCELLED" }): IcloudCalendarEventSource {
  return {
    provider: "icloud-calendar",
    eventId: record.uid,
    calendarId: record.calendarUrl,
    title: record.summary || "(Başlıksız etkinlik)",
    description: record.description,
    startAt: record.startAt,
    endAt: record.endAt,
    allDay: record.allDay,
    attendees: [],
    htmlLink: "",
    status: record.status,
  };
}

/**
 * Arbitrary [rangeStart, rangeEnd) window — the same canonical range
 * semantics listCalendarEventsInRange (Google) and calendar.events (native)
 * already use; this is the function the unified Canonical Calendar
 * Projection (company-intelligence/calendar-projection.ts) calls. Never
 * anchored to "now" only — today, tomorrow, this week, or a full month
 * range all resolve to a plain [rangeStart, rangeEnd) here.
 */
export async function listIcloudCalendarEventsInRange(input: { organizationId: string; userId: string; rangeStart: string; rangeEnd: string }): Promise<IcloudCalendarRetrievalContext> {
  const retrievedAt = new Date().toISOString();
  const row = await prisma.icloudConnection.findUnique({ where: { organizationId_userId: { organizationId: input.organizationId, userId: input.userId } } });
  if (!row) return { status: "NOT_CONNECTED", retrievedAt, events: [] };

  const appSpecificPassword = decryptIntegrationSecret(row.appSpecificPasswordEncrypted);

  // Re-enumerate calendar collections on every read (cheap: one PROPFIND)
  // rather than trusting the connect-time cache forever — a calendar added
  // or removed on the user's device must show up without reconnecting.
  const collections = row.caldavHomeSetUrl ? await listCalendarCollections(row.appleId, appSpecificPassword, row.caldavHomeSetUrl) : { status: "UNAVAILABLE" as const, detail: "ICLOUD_NO_HOMESET" };
  if (collections.status === "AUTH_REQUIRED") {
    await prisma.icloudConnection.update({ where: { id: row.id, organizationId: input.organizationId }, data: { status: "AUTH_REQUIRED", lastErrorAt: new Date(), lastErrorCode: "ICLOUD_AUTH_REQUIRED" } });
    return { status: "AUTH_REQUIRED", retrievedAt, events: [] };
  }
  if (collections.status !== "OK") {
    await prisma.icloudConnection.update({ where: { id: row.id, organizationId: input.organizationId }, data: { status: "ERROR", lastErrorAt: new Date(), lastErrorCode: collections.detail.slice(0, 80) } });
    return { status: "UNAVAILABLE", retrievedAt, events: [] };
  }

  const result = await queryEventsInRange({ appleId: row.appleId, appSpecificPassword, calendarUrls: collections.calendarUrls, rangeStart: new Date(input.rangeStart), rangeEnd: new Date(input.rangeEnd) });
  if (result.status === "AUTH_REQUIRED") {
    await prisma.icloudConnection.update({ where: { id: row.id, organizationId: input.organizationId }, data: { status: "AUTH_REQUIRED", lastErrorAt: new Date(), lastErrorCode: "ICLOUD_AUTH_REQUIRED" } });
    return { status: "AUTH_REQUIRED", retrievedAt, events: [] };
  }
  if (result.status !== "OK") {
    await prisma.icloudConnection.update({ where: { id: row.id, organizationId: input.organizationId }, data: { status: "ERROR", lastErrorAt: new Date(), lastErrorCode: result.detail.slice(0, 80) } });
    return { status: "UNAVAILABLE", retrievedAt, events: [] };
  }

  await prisma.icloudConnection.update({ where: { id: row.id, organizationId: input.organizationId }, data: { lastSuccessfulAccessAt: new Date(), status: "CONNECTED", lastErrorAt: null, lastErrorCode: null } });
  const events = result.events.slice(0, MAX_RANGE_EVENTS).map(toEventSource);
  return { status: events.length ? "OK" : "NO_RESULTS", retrievedAt, events };
}
