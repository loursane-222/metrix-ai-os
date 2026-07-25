import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, generate } = vi.hoisted(() => ({ auth: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/auth/guards/api-auth-guard", () => ({ requireAuthContextFromCookies: auth }));
vi.mock("@/lib/customers/customer-create-conversation-ai-adapter", () => ({ generateCustomerCreatePlanText: generate }));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { $transaction: vi.fn() } }));

import { POST } from "../route";

const live = "METRIX yeni müşteri kaydı aç. Firma ismi Arda Yapı olacak. Yetkilisi Murat Arda. Telefonu 0542 280 91 77.";
const request = (body: unknown, correlationId?: string) => new Request("http://localhost/api/customers/actions/create-command", { method: "POST", headers: { "Content-Type": "application/json", ...(correlationId ? { "X-Correlation-Id": correlationId } : {}) }, body: JSON.stringify(body) });

describe("POST /api/customers/actions/create-command", () => {
  beforeEach(() => { auth.mockReset().mockResolvedValue({ user: { id: "u" }, organization: { id: "o" } }); generate.mockReset(); });
  it("preserves supported live fields and the bounded unsupported notice without mutation", async () => {
    generate.mockResolvedValue(JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN", fields: { displayName: "Arda Yapı", phone: "0542 280 91 77" }, explicitCommit: false, unsupportedFields: [{ field: "primaryContact", userLabel: "yetkili", message: "Yetkili kişi bu formda henüz desteklenmiyor." }] }));
    const response = await POST(request({ utterance: live, pendingContext: null })); const json = await response.json();
    expect(response.status).toBe(200); expect(json.data.plan).toMatchObject({ fields: { displayName: "Arda Yapı", phone: "0542 280 91 77", "primaryContact.fullName": "Murat Arda" }, unsupportedFields: [] });
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
    expect(response.status).toBe(200); expect(json.data.plan).toMatchObject({ fields: { displayName: "Arda Yapı", phone: "0542 280 91 77", "primaryContact.fullName": "Murat Arda" }, unsupportedFields: [] });
  });
  it.each([{ utterance: "x", actorId: "attack" }, { utterance: "x", pendingContext: { lifecycle: "COLLECTING", fields: { customerId: "attack" }, missingFields: ["displayName"] } }, { utterance: "x", pendingContext: { lifecycle: "COLLECTING", fields: {}, missingFields: ["phone"] } }])("rejects unsafe request shape", async (body) => expect((await POST(request(body))).status).toBe(400));
  it("requires authentication before provider access", async () => { auth.mockRejectedValue(new Error("unauthorized")); expect((await POST(request({ utterance: live, pendingContext: null }))).status).not.toBe(200); expect(generate).not.toHaveBeenCalled(); });
  it("emits PII-free Atlas enrichment planner telemetry with the supplied correlation", async () => {
    const telemetry = vi.spyOn(console, "info").mockImplementation(() => undefined);
    generate.mockResolvedValue(JSON.stringify({ kind: "CREATE_PLAN", intent: "UPDATE_DRAFT", fields: { currency: "EUR" }, explicitCommit: false, unsupportedFields: [], operation: "ENRICH", entityReference: "Atlas" }));
    const response = await POST(request({ utterance: "Atlas artık euro ile çalışıyor.", pendingContext: null }, "turn-atlas-1"));
    expect(response.status).toBe(200);
    const plannerCall = telemetry.mock.calls.find(([prefix, payload]) => prefix === "[CustomerPlanner][lifecycle]" && String(payload).includes('"event":"planner_resolved"'));
    expect(plannerCall).toBeDefined();
    expect(JSON.parse(String(plannerCall![1]))).toMatchObject({
      correlationId: "turn-atlas-1", planKind: "CREATE_PLAN", operation: "ENRICH",
      semanticStage: "PROVIDE_FIELDS", hasEntityReference: true, fieldCount: 1,
      explicitCommit: false,
    });
    const serialized = JSON.stringify(telemetry.mock.calls);
    expect(serialized).not.toContain("Atlas");
    expect(serialized).not.toContain("EUR");
    expect(serialized).not.toContain("euro ile çalışıyor");
    telemetry.mockRestore();
  });
  it("repairs the exact production multi-sentence provider miss before telemetry", async () => {
    const telemetry = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const utterance = "Atlas artık euro ile çalışıyor. Önümüzdeki hafta da yeni fiyat teklifi istemeleri muhtemel.";
    generate.mockResolvedValue(JSON.stringify({ kind: "CREATE_PLAN", intent: "UPDATE_DRAFT", fields: {}, explicitCommit: false, unsupportedFields: [], operation: "UPDATE" }));
    const response = await POST(request({ utterance, pendingContext: null }, "turn-atlas-production"));
    const json = await response.json();
    expect(json.data.plan).toMatchObject({
      operation: "ENRICH",
      entityReference: "Atlas",
      fields: { currency: "EUR" },
      semantic: { probableClauseCount: 1 },
    });
    const plannerCall = telemetry.mock.calls.find(([prefix, payload]) => prefix === "[CustomerPlanner][lifecycle]" && String(payload).includes('"event":"planner_resolved"'));
    expect(JSON.parse(String(plannerCall![1]))).toMatchObject({ operation: "ENRICH", hasEntityReference: true, fieldCount: 1 });
    expect(JSON.stringify(telemetry.mock.calls)).not.toContain(utterance);
    expect(JSON.stringify(telemetry.mock.calls)).not.toContain("Atlas");
    expect(JSON.stringify(telemetry.mock.calls)).not.toContain("EUR");
  });
});
