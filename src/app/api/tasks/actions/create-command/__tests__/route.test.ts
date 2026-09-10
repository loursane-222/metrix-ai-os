import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, generate, listActiveNotificationRecipientRecords } = vi.hoisted(() => ({
  auth: vi.fn(),
  generate: vi.fn(),
  listActiveNotificationRecipientRecords: vi.fn(),
}));
vi.mock("@/lib/auth/guards/api-auth-guard", () => ({ requireAuthContextFromCookies: auth, authFail: (error: unknown) => new Response(JSON.stringify({ ok: false, error: { message: String(error) } }), { status: 401 }) }));
vi.mock("@/lib/tasks/task-create-conversation-ai-adapter", () => ({ generateTaskCreatePlanText: generate }));
vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({ listActiveNotificationRecipientRecords }));

import { POST } from "../route";

const request = (body: unknown) => new Request("http://localhost/api/tasks/actions/create-command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Assignee resolution reuses the same canonical member/self authority every
// manager-decision flow already uses (resolveRepByName) — see "Member /
// Assignee Authority" in the task-create regression repair notes. The
// planner never emits a resolved id itself, only a semantic
// assigneeReference; this route is the single place that turns it into the
// real task.assigneeUserId.
describe("POST /api/tasks/actions/create-command — assignee resolution", () => {
  beforeEach(() => {
    auth.mockReset().mockResolvedValue({ user: { id: "user-me", fullName: "Murat Arda" }, organization: { id: "org-1" } });
    generate.mockReset();
    listActiveNotificationRecipientRecords.mockReset();
  });

  it("resolves a SELF assigneeReference to the requesting user without a member lookup", async () => {
    generate.mockResolvedValue(JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN_UPDATE_COMMIT", fields: { title: "Ahmet müşterisini ara", dueDate: "2026-09-11" }, explicitCommit: true, assigneeReference: "SELF" }));
    const response = await POST(request({ utterance: "Yarın bana Ahmet müşterisini aramam için görev oluştur.", pendingContext: null }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.plan).toMatchObject({ kind: "CREATE_PLAN", fields: { title: "Ahmet müşterisini ara", assigneeUserId: "user-me" } });
    expect(listActiveNotificationRecipientRecords).not.toHaveBeenCalled();
  });

  it("resolves a uniquely-named assigneeReference to the real organization member id", async () => {
    listActiveNotificationRecipientRecords.mockResolvedValue([{ userId: "user-ahmet", fullName: "Ahmet Yılmaz", role: "MEMBER" }]);
    generate.mockResolvedValue(JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN_UPDATE_COMMIT", fields: { title: "Müşteriyi ara" }, explicitCommit: true, assigneeReference: "Ahmet" }));
    const response = await POST(request({ utterance: "Ahmete müşteriyi araması için görev oluştur.", pendingContext: null }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.plan.fields.assigneeUserId).toBe("user-ahmet");
  });

  it("downgrades to CLARIFICATION_REQUIRED — never invents an id — when the named assignee is ambiguous", async () => {
    listActiveNotificationRecipientRecords.mockResolvedValue([
      { userId: "user-ahmet-1", fullName: "Ahmet Yılmaz", role: "MEMBER" },
      { userId: "user-ahmet-2", fullName: "Ahmet Demir", role: "MEMBER" },
    ]);
    generate.mockResolvedValue(JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN_UPDATE_COMMIT", fields: { title: "Müşteriyi ara" }, explicitCommit: true, assigneeReference: "Ahmet" }));
    const response = await POST(request({ utterance: "Ahmete görev oluştur.", pendingContext: null }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.plan.kind).toBe("CLARIFICATION_REQUIRED");
  });

  it("downgrades to CLARIFICATION_REQUIRED when the named assignee cannot be found", async () => {
    listActiveNotificationRecipientRecords.mockResolvedValue([]);
    generate.mockResolvedValue(JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN_UPDATE_COMMIT", fields: { title: "Müşteriyi ara" }, explicitCommit: true, assigneeReference: "Kimsecik" }));
    const response = await POST(request({ utterance: "Kimseciğe görev oluştur.", pendingContext: null }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.plan.kind).toBe("CLARIFICATION_REQUIRED");
  });

  it("leaves the plan untouched when no assignee was referenced", async () => {
    generate.mockResolvedValue(JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN", fields: { title: "Raporu bitir" }, explicitCommit: false, assigneeReference: null }));
    const response = await POST(request({ utterance: "Raporu bitirmek için görev oluştur.", pendingContext: null }));
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.plan.fields.assigneeUserId).toBeUndefined();
    expect(listActiveNotificationRecipientRecords).not.toHaveBeenCalled();
  });
});
