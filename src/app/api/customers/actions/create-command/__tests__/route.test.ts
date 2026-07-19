import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, generate } = vi.hoisted(() => ({ auth: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/auth/guards/api-auth-guard", () => ({ requireAuthContextFromCookies: auth }));
vi.mock("@/lib/customers/customer-create-conversation-ai-adapter", () => ({ generateCustomerCreatePlanText: generate }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { $transaction: vi.fn() } }));

import { POST } from "../route";

const live = "METRIX yeni müşteri kaydı aç. Firma ismi Arda Yapı olacak. Yetkilisi Murat Arda. Telefonu 0542 280 91 77.";
const request = (body: unknown) => new Request("http://localhost/api/customers/actions/create-command", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("POST /api/customers/actions/create-command", () => {
  beforeEach(() => { auth.mockReset().mockResolvedValue({ user: { id: "u" }, organization: { id: "o" } }); generate.mockReset(); });
  it("preserves supported live fields and the bounded unsupported notice without mutation", async () => {
    generate.mockResolvedValue(JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN", fields: { displayName: "Arda Yapı", phone: "0542 280 91 77" }, explicitCommit: false, unsupportedFields: [{ field: "primaryContact", userLabel: "yetkili", message: "Yetkili kişi bu formda henüz desteklenmiyor." }] }));
    const response = await POST(request({ utterance: live, pendingContext: null })); const json = await response.json();
    expect(response.status).toBe(200); expect(json.data.plan).toMatchObject({ fields: { displayName: "Arda Yapı", phone: "0542 280 91 77" }, unsupportedFields: [{ field: "primaryContact" }] });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("passes only safe pending slot context and resolves a bare value", async () => {
    generate.mockResolvedValue(JSON.stringify({ kind: "CREATE_PLAN", intent: "UPDATE_DRAFT", fields: { displayName: "Arda Yapı" }, explicitCommit: false, unsupportedFields: [] }));
    const pendingContext = { lifecycle: "COLLECTING", fields: { phone: "0542 280 91 77" }, missingFields: ["displayName"] };
    const response = await POST(request({ utterance: "Arda Yapı.", pendingContext })); expect(response.status).toBe(200);
    expect(generate.mock.calls[0]![0].systemPrompt).toContain(JSON.stringify(pendingContext));
  });
  it("uses the safe deterministic resolver when provider output is invalid", async () => {
    generate.mockResolvedValue("not json"); const response = await POST(request({ utterance: live, pendingContext: null })); const json = await response.json();
    expect(response.status).toBe(200); expect(json.data.plan).toMatchObject({ fields: { displayName: "Arda Yapı", phone: "0542 280 91 77" }, unsupportedFields: [{ field: "primaryContact" }] });
  });
  it.each([{ utterance: "x", actorId: "attack" }, { utterance: "x", pendingContext: { lifecycle: "COLLECTING", fields: { customerId: "attack" }, missingFields: ["displayName"] } }, { utterance: "x", pendingContext: { lifecycle: "COLLECTING", fields: {}, missingFields: ["phone"] } }])("rejects unsafe request shape", async (body) => expect((await POST(request(body))).status).toBe(400));
  it("requires authentication before provider access", async () => { auth.mockRejectedValue(new Error("unauthorized")); expect((await POST(request({ utterance: live, pendingContext: null }))).status).not.toBe(200); expect(generate).not.toHaveBeenCalled(); });
});
