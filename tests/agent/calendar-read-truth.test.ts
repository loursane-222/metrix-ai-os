import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { RunContext } from "@openai/agents";

import { db } from "../../src/lib/db";
import { createCalendarTools } from "../../src/lib/agent/tools/calendar-tools";
import {
  buildMetrixExecutiveBackendInstructions,
  METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS
} from "../../src/lib/agent/metrix-executive-contract";
import {
  CALENDAR_LIST_BUSINESS_TOOL,
  CalendarListToolParameters,
  METRIX_RESPONSES_FUNCTION_TOOLS,
  beginToolCallCapture,
  canonicalResultsFromToolCalls,
  endToolCallCapture,
  executeMetrixBusinessTool
} from "../../src/lib/agent/tools/metrix-business-tool-runtime";
import { projectCapabilityResults } from "../../src/lib/presentation/project-result";
import { encryptSecret } from "../../src/lib/integrations/credential-crypto";

// Drives the real canonical chain — calendar_list → executeMetrixBusinessTool
// → dispatch → native read + external lookup → Nylas client → canonical
// capture → presentation projection — against a stubbed global fetch.
// Nothing here can reach the real Nylas or Google Calendar.

const ORIGINAL_CLIENT_ID = process.env.NYLAS_CLIENT_ID;
const ORIGINAL_API_KEY = process.env.NYLAS_API_KEY;
const ORIGINAL_ENCRYPTION_KEY = process.env.INTEGRATION_SECRET_ENCRYPTION_KEY;
const ORIGINAL_TZ = process.env.TZ;

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Fetched = { ok: boolean; status: number; json: () => Promise<unknown> };

let respond: () => Promise<Fetched> = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ data: [] })
});
let requestedUrls: string[] = [];

const ok = (body: unknown) => async (): Promise<Fetched> => ({
  ok: true,
  status: 200,
  json: async () => body
});
const status = (code: number) => async (): Promise<Fetched> => ({
  ok: false,
  status: code,
  json: async () => ({ error: { message: "provider detail that must never surface" } })
});

const RANGE = {
  endsAfter: "2026-09-18T00:00:00+03:00",
  startsBefore: "2026-09-18T23:59:59+03:00",
  mode: "DAY"
};

const createdOrgs: string[] = [];
const createdUsers: string[] = [];

async function createOrg(label: string, connected: boolean) {
  const organizationId = `cal-truth-org-${suffix}-${label}`;
  const userId = `cal-truth-user-${suffix}-${label}`;

  await db.organization.create({ data: { id: organizationId, name: "Calendar Truth Org" } });
  await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "User" } });
  await db.organizationMember.create({ data: { organizationId, userId, role: "MEMBER" } });

  if (connected) {
    await db.integrationConnection.create({
      data: {
        organizationId,
        provider: "NYLAS",
        status: "CONNECTED",
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ grantId: `grant-${label}`, email: "owner@example.test", provider: "google" })
        )
      }
    });
  }

  createdOrgs.push(organizationId);
  createdUsers.push(userId);

  return { organizationId, userId };
}

async function addNativeEvent(ctx: { organizationId: string; userId: string }, title: string) {
  await db.calendarEvent.create({
    data: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      title,
      startsAt: new Date("2026-09-18T10:00:00.000Z"),
      endsAt: new Date("2026-09-18T11:00:00.000Z"),
      allDay: false
    }
  });
}

let turn = 0;

async function runCalendarList(
  ctx: { organizationId: string; userId: string },
  args: Record<string, unknown> = RANGE
) {
  turn += 1;
  const scope = `turn:cal-truth-${suffix}-${turn}`;

  beginToolCallCapture(scope);
  const result = (await executeMetrixBusinessTool({
    name: "calendar_list",
    argumentsJson: JSON.stringify(args),
    context: {
      actorUserId: ctx.userId,
      organizationId: ctx.organizationId,
      idempotencyScope: scope,
      timezone: "Europe/Istanbul",
      referenceTimeIso: "2026-09-18T12:00:00.000Z"
    }
  })) as {
    events: Array<{ id: string; title: string }>;
    externalCalendar: { status: string; connected: boolean; verified: boolean };
  };
  const captured = endToolCallCapture(scope);
  const presentations = projectCapabilityResults(canonicalResultsFromToolCalls(captured));

  return { result, presentations, view: presentations[0] as { type: string; notice?: string; events: Array<{ title: string }> } | undefined };
}

beforeAll(() => {
  process.env.NYLAS_CLIENT_ID = "test-client-id";
  process.env.NYLAS_API_KEY = "test-api-key";

  vi.stubGlobal("fetch", async (url: string) => {
    requestedUrls.push(url);
    return respond();
  });
});

beforeEach(() => {
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  requestedUrls = [];
  respond = ok({ data: [] });
});

afterEach(async () => {
  process.env.TZ = ORIGINAL_TZ;

  for (const organizationId of createdOrgs.splice(0)) {
    await db.calendarEvent.deleteMany({ where: { organizationId } });
    await db.integrationConnection.deleteMany({ where: { organizationId } });
    await db.organizationMember.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
  }

  for (const id of createdUsers.splice(0)) {
    await db.user.deleteMany({ where: { id } });
  }
});

afterAll(async () => {
  vi.unstubAllGlobals();
  process.env.NYLAS_CLIENT_ID = ORIGINAL_CLIENT_ID;
  process.env.NYLAS_API_KEY = ORIGINAL_API_KEY;
  process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = ORIGINAL_ENCRYPTION_KEY;
  await db.$disconnect();
});

const PROVIDER_EVENT = {
  id: "provider-evt-77aa",
  title: "Google Toplantısı",
  when: { object: "timespan", start_time: 1_789_725_600, end_time: 1_789_729_200 }
};

describe("calendar_list — external calendar status travels with the canonical result", () => {
  it("connected + success + events: external events are merged and the read is verified", async () => {
    const ctx = await createOrg("ev", true);
    respond = ok({ data: [PROVIDER_EVENT] });

    const { result, view } = await runCalendarList(ctx);

    expect(result.externalCalendar).toEqual({ status: "READ_OK", connected: true, verified: true });
    expect(result.events.map(e => e.title)).toEqual(["Google Toplantısı"]);
    expect(view?.type).toBe("CALENDAR");
    expect(view?.notice).toBeUndefined();
    expect(view?.events).toHaveLength(1);
  });

  it("connected + success + empty and native empty: a real, verified empty calendar", async () => {
    const ctx = await createOrg("real-empty", true);
    respond = ok({ data: [] });

    const { result, view } = await runCalendarList(ctx);

    expect(result.events).toEqual([]);
    expect(result.externalCalendar).toEqual({ status: "READ_OK", connected: true, verified: true });
    // Only this combination may be called empty — and the view then says so.
    expect(view?.notice).toBeUndefined();
  });

  it("not connected: reported as NOT_CONNECTED and unverified, never a verified empty", async () => {
    const ctx = await createOrg("noconn", false);

    const { result, view } = await runCalendarList(ctx);

    expect(requestedUrls).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.externalCalendar).toEqual({
      status: "NOT_CONNECTED",
      connected: false,
      verified: false
    });
    expect(view?.notice).toMatch(/Google Takvim bağlı değil/);
  });

  it("not connected with a native event: the native event is shown without a scary notice", async () => {
    const ctx = await createOrg("noconn-native", false);
    await addNativeEvent(ctx, "METRIX Toplantısı");

    const { result, view } = await runCalendarList(ctx);

    expect(result.events.map(e => e.title)).toEqual(["METRIX Toplantısı"]);
    expect(result.externalCalendar.status).toBe("NOT_CONNECTED");
    expect(view?.notice).toBeUndefined();
  });

  it.each([
    ["provider 4xx", status(403)],
    ["provider 5xx", status(503)],
    [
      "timeout",
      async (): Promise<Fetched> => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }
    ],
    [
      "network failure",
      async (): Promise<Fetched> => {
        throw new TypeError("fetch failed");
      }
    ],
    ["a 2xx that is not an events list", ok({ data: { unexpected: true } })]
  ])("%s: READ_FAILED, unverified — never presented as an empty calendar", async (_label, failing) => {
    const ctx = await createOrg("fail", true);
    respond = failing as () => Promise<Fetched>;

    const { result, view } = await runCalendarList(ctx);

    expect(result.events).toEqual([]);
    expect(result.externalCalendar).toEqual({
      status: "READ_FAILED",
      connected: true,
      verified: false
    });
    expect(view?.type).toBe("CALENDAR");
    expect(view?.notice).toMatch(/doğrulanamadı/);
    // The user-facing notice carries no provider error text or ids.
    expect(view?.notice).not.toMatch(/HTTP|Nylas|fetch|timed out|provider detail|grant/i);
    expect(JSON.stringify(result)).not.toMatch(/provider detail|HTTP_|fetch failed|grant-/i);
  });

  it("native event + external failure: the native event survives and the external failure is not lost", async () => {
    const ctx = await createOrg("native-fail", true);
    await addNativeEvent(ctx, "METRIX Toplantısı");
    respond = status(500);

    const { result, view } = await runCalendarList(ctx);

    expect(result.events.map(e => e.title)).toEqual(["METRIX Toplantısı"]);
    expect(result.externalCalendar.status).toBe("READ_FAILED");
    expect(result.externalCalendar.verified).toBe(false);

    expect(view?.events.map(e => e.title)).toEqual(["METRIX Toplantısı"]);
    expect(view?.notice).toMatch(/doğrulanamadı/);
    expect(view?.notice).toMatch(/Takvimin tamamı doğrulanmış değil/);
  });

  it("partial external read: incomplete is reported, not silently shown as complete", async () => {
    const ctx = await createOrg("partial", true);
    respond = ok({
      data: [PROVIDER_EVENT, { id: "odd", title: "Bilinmeyen", when: { object: "time", time: 1 } }]
    });

    const { result, view } = await runCalendarList(ctx);

    expect(result.externalCalendar).toEqual({ status: "READ_PARTIAL", connected: true, verified: false });
    expect(result.events).toHaveLength(1);
    expect(view?.notice).toMatch(/eksik olabilir/);
  });

  it("the raw provider event id never reaches a user-facing text field", async () => {
    const ctx = await createOrg("noleak", true);
    respond = ok({ data: [PROVIDER_EVENT] });

    const { view } = await runCalendarList(ctx);

    expect(view?.notice ?? "").not.toContain("provider-evt-77aa");
    expect(view?.events.map(e => e.title).join(" ")).not.toContain("provider-evt-77aa");

    // The renderer only ever uses event ids as React keys, never as text.
    const renderer = readFileSync("src/components/metrix-view/CalendarPresentationView.tsx", "utf8");
    const idUses = renderer.split("\n").filter(line => /\.id\b/.test(line));
    expect(idUses.length).toBeGreaterThan(0);
    for (const line of idUses) {
      expect(line).toMatch(/key=\{/);
    }
  });

  it("the renderer shows the notice and never claims 'no events' while a notice is present", () => {
    const renderer = readFileSync("src/components/metrix-view/CalendarPresentationView.tsx", "utf8");

    expect(renderer).toContain("presentation.notice");
    expect(renderer).toContain("hasNotice={Boolean(presentation.notice)}");
    expect(renderer).toMatch(/timedCount === 0 && !hasNotice/);
  });
});

describe("calendar_list — offset-bearing ISO contract", () => {
  it.each([
    ["+03:00 offset", "2026-09-19T00:00:00+03:00"],
    ["negative offset", "2026-09-19T00:00:00-05:00"],
    ["Z (UTC)", "2026-09-18T21:00:00Z"],
    ["Z with milliseconds", "2026-09-18T21:00:00.000Z"]
  ])("ACCEPTS %s", (_label, value) => {
    expect(CalendarListToolParameters.safeParse({ startsBefore: value }).success).toBe(true);
    expect(CalendarListToolParameters.safeParse({ endsAfter: value }).success).toBe(true);
  });

  it.each([
    ["no offset", "2026-09-19T00:00:00"],
    ["no offset with milliseconds", "2026-09-19T00:00:00.000"],
    ["date only", "2026-09-19"],
    ["invalid text", "yarın sabah"],
    ["impossible date", "2026-13-40T00:00:00+03:00"],
    ["compact offset", "2026-09-19T00:00:00+0300"],
    ["empty string", ""]
  ])("REJECTS %s", (_label, value) => {
    expect(CalendarListToolParameters.safeParse({ startsBefore: value }).success).toBe(false);
    expect(CalendarListToolParameters.safeParse({ endsAfter: value }).success).toBe(false);
  });

  it("the runtime dispatch rejects an offset-less boundary before any read", async () => {
    const ctx = await createOrg("dispatch-reject", true);

    await expect(
      runCalendarList(ctx, { endsAfter: "2026-09-18T00:00:00", startsBefore: "2026-09-18T23:59:59", mode: "DAY" })
    ).rejects.toThrow();

    expect(requestedUrls).toEqual([]);
  });

  it("the Executive tool wrapper hands an offset-less boundary back as an error, with no provider call", async () => {
    const ctx = await createOrg("tool-reject", true);
    const [calendarList] = createCalendarTools();

    const raw = await calendarList!.invoke(
      new RunContext({ actorUserId: ctx.userId, organizationId: ctx.organizationId, turnId: `t-${suffix}-rej` }),
      JSON.stringify({ endsAfter: "2026-09-18T00:00:00", startsBefore: null, mode: "DAY" })
    );
    const output = typeof raw === "string" ? raw : JSON.stringify(raw);

    expect(output).not.toContain("externalCalendar");
    expect(requestedUrls).toEqual([]);
  });

  it("the Executive tool wrapper accepts the strict-mode shape (nulls for absent fields) with an offset boundary", async () => {
    const ctx = await createOrg("tool-accept", true);
    respond = ok({ data: [PROVIDER_EVENT] });
    const [calendarList] = createCalendarTools();

    const raw = await calendarList!.invoke(
      new RunContext({ actorUserId: ctx.userId, organizationId: ctx.organizationId, turnId: `t-${suffix}-acc` }),
      JSON.stringify({ endsAfter: "2026-09-18T00:00:00+03:00", startsBefore: null, mode: "DAY" })
    );
    const output = typeof raw === "string" ? raw : JSON.stringify(raw);

    expect(output).toContain('"status":"READ_OK"');
  });

  it("does not depend on the server timezone: the provider range is the exact instant under any process TZ", async () => {
    const ctx = await createOrg("tz", true);
    const expectedStart = Date.parse("2026-09-17T21:00:00Z") / 1000;
    const expectedEnd = Date.parse("2026-09-18T20:59:59Z") / 1000;

    for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      requestedUrls = [];

      await runCalendarList(ctx);

      expect(requestedUrls[0]).toContain(`start=${expectedStart}`);
      expect(requestedUrls[0]).toContain(`end=${expectedEnd}`);
    }
  });

  it("publishes the offset rule to the model: description, JSON schema and Executive instructions", () => {
    expect(CALENDAR_LIST_BUSINESS_TOOL.description).toContain("offsetli ISO 8601");
    expect(CALENDAR_LIST_BUSINESS_TOOL.description).toContain("externalCalendar.verified");

    const published = METRIX_RESPONSES_FUNCTION_TOOLS.find(tool => tool.name === "calendar_list")!;
    const properties = (published.parameters as { properties: Record<string, { format?: string }> }).properties;
    expect(properties.startsBefore?.format).toBe("date-time");
    expect(properties.endsAfter?.format).toBe("date-time");

    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("externalCalendar.verified");
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("READ_FAILED");
    // The existing guidance is intact.
    expect(METRIX_EXECUTIVE_BACKEND_INSTRUCTIONS).toContain("ayrı bir takvim değildir");

    const withTime = buildMetrixExecutiveBackendInstructions({
      timezone: "Europe/Istanbul",
      referenceTimeIso: "2026-09-18T12:00:00.000Z"
    });
    // The prose wraps across lines; compare it with whitespace collapsed.
    const collapsed = withTime.replace(/\s+/g, " ");
    expect(collapsed).toContain("calendar_list için startsBefore/endsAfter");
    expect(collapsed).toContain("açık offsetli ISO 8601");
    expect(collapsed).toContain("Europe/Istanbul");
  });
});

describe("calendar_list — cross-tenant read through the canonical chain", () => {
  it("org A reads with its own grant only; org B's grant is never used", async () => {
    const orgA = await createOrg("xa", true);
    await createOrg("xb", true);

    await runCalendarList(orgA);

    expect(requestedUrls).toHaveLength(1);
    expect(requestedUrls[0]).toContain("/grants/grant-xa/");
    expect(requestedUrls.join(" ")).not.toContain("grant-xb");
  });

  it("an org without a connection sees NOT_CONNECTED even when another tenant is connected", async () => {
    await createOrg("xc-connected", true);
    const orgD = await createOrg("xd-none", false);
    respond = ok({ data: [PROVIDER_EVENT] });

    const { result } = await runCalendarList(orgD);

    expect(requestedUrls).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.externalCalendar.status).toBe("NOT_CONNECTED");
  });
});
