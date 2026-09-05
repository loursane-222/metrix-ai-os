import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Residual Capability Parity Migration — calendar-management closure.
 * These weekday-math cases are the exact same matrix
 * calendar-management-conversation-extension.ts used to prove before its
 * CREATE branch was retired — moved here unchanged (same DAY_INDEX
 * arithmetic, same "roll to next week if today's occurrence already
 * passed" rule) since the deterministic resolver itself was relocated, not
 * rewritten. Per this operation's binding rule, the model must never invent
 * these dates itself — resolve_calendar_expression is the only source.
 */

const mocks = vi.hoisted(() => ({
  listOrganizationMemberRecords: vi.fn(),
  computeAvailability: vi.fn(),
}));

vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({ listOrganizationMemberRecords: mocks.listOrganizationMemberRecords }));
vi.mock("@/lib/core/calendar/calendar-intelligence.service", () => ({ computeAvailability: mocks.computeAvailability }));

const {
  buildResolveCalendarExpressionTool, buildFindOrganizationMemberForCalendarTool, buildQueryMemberAvailabilityTool,
} = await import("../calendar-semantic-tools");

const runContext = { organizationId: "org-1", actorId: "user-1" } as never;

async function invoke(tool: { invoke: (ctx: never, input: string) => Promise<unknown> }, input: Record<string, unknown>): Promise<{ data: unknown }> {
  const result = await tool.invoke({ context: runContext } as never, JSON.stringify(input));
  return result as { data: unknown };
}

describe("resolve_calendar_expression — deterministic, server-clock-based, never model-invented", () => {
  afterEach(() => { vi.useRealTimers(); });

  it.each([
    ["pazartesi", 1], ["salı", 2], ["çarşamba", 3], ["perşembe", 4], ["cuma", 5], ["cumartesi", 6], ["pazar", 0],
  ] as const)("resolves the next %s to the correct real weekday, rolling to next week when today's occurrence already passed", async (dayExpression, expectedDay) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00+03:00")); // a Wednesday
    const result = await invoke(buildResolveCalendarExpressionTool(), { dayExpression, hours: 18, minutes: 30 });
    const data = result.data as { status: string; startAtIso: string };
    expect(data.status).toBe("RESOLVED");
    expect(new Date(data.startAtIso).getDay()).toBe(expectedDay);
    expect(new Date(data.startAtIso).getTime()).toBeGreaterThan(Date.now());
  });

  it("resolves 'bugün' to today at the given time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T08:00:00+03:00"));
    const result = await invoke(buildResolveCalendarExpressionTool(), { dayExpression: "bugün", hours: 18, minutes: 30 });
    const data = result.data as { status: string; startAtIso: string };
    expect(new Date(data.startAtIso).toDateString()).toBe(new Date("2026-08-12T18:30:00+03:00").toDateString());
  });

  it("resolves 'yarın' to tomorrow", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T08:00:00+03:00"));
    const result = await invoke(buildResolveCalendarExpressionTool(), { dayExpression: "yarın", hours: 9, minutes: 0 });
    const data = result.data as { status: string; startAtIso: string };
    expect(new Date(data.startAtIso).toDateString()).toBe(new Date("2026-08-13T09:00:00+03:00").toDateString());
  });
});

describe("find_organization_member_for_calendar / query_member_availability — thin delegation", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("resolves a colleague's name against ACTIVE members only, via the shared resolveOrganizationMemberByName algorithm", async () => {
    mocks.listOrganizationMemberRecords.mockResolvedValue([
      { id: "member-1", email: "a@x.com", fullName: "Ayşe Yılmaz", role: "EMPLOYEE", status: "ACTIVE", joinedAt: new Date() },
      { id: "member-2", email: "b@x.com", fullName: "Ayşe Kaya", role: "EMPLOYEE", status: "INACTIVE", joinedAt: new Date() },
    ]);
    const result = await invoke(buildFindOrganizationMemberForCalendarTool(runContext), { nameRaw: "Ayşe Yılmaz" });
    expect(mocks.listOrganizationMemberRecords).toHaveBeenCalledWith("org-1");
    expect(result.data).toMatchObject({ status: "RESOLVED", member: { id: "member-1" } });
  });

  it("query_member_availability calls computeAvailability with the exact memberId and organizationId from runContext, never guessing them", async () => {
    mocks.computeAvailability.mockResolvedValue({ status: "AVAILABLE", label: "Odaklanıyor" });
    const result = await invoke(buildQueryMemberAvailabilityTool(runContext), { memberId: "member-1", atIso: "2026-08-09T10:30:00.000Z" });
    expect(mocks.computeAvailability).toHaveBeenCalledWith("member-1", "org-1", new Date("2026-08-09T10:30:00.000Z"));
    expect(result.data).toMatchObject({ status: "AVAILABLE", label: "Odaklanıyor" });
  });
});
