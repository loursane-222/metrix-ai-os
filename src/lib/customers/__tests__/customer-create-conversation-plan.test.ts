import { describe, expect, it } from "vitest";
import { validateCustomerCreatePlan } from "../customer-create-conversation-plan";
import { extractObviousCustomerCreatePlan, resolveCustomerCreatePlan } from "../customer-create-conversation-planner";
describe("customer create conversation planner", () => {
  it("accepts strict multi-field JSON and preserves Turkish values", async () => {
    const plan = await resolveCustomerCreatePlan({ utterance: "x", pendingContext: null, generateText: async () => JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN_UPDATE_COMMIT", fields: { displayName: "Arda Yapı", legalName: "Arda Yapı İnşaat AŞ", phone: "0532 111 22 33", email: "test@ardayapi.com" }, explicitCommit: true, unsupportedFields: [] }) });
    expect(plan).toMatchObject({ kind: "CREATE_PLAN", explicitCommit: true, fields: { displayName: "Arda Yapı", legalName: "Arda Yapı İnşaat AŞ", phone: "0532 111 22 33", email: "test@ardayapi.com" } });
  });
  it.each([
    [{ kind: "CREATE_PLAN", intent: "OPEN", fields: { customerId: "fake" }, explicitCommit: false, unsupportedFields: [] }],
    [{ kind: "CREATE_PLAN", intent: "OPEN", fields: { actorId: "x" }, explicitCommit: false, unsupportedFields: [] }],
    [{ kind: "CREATE_PLAN", intent: "EXECUTE_ANY", fields: {}, explicitCommit: false, unsupportedFields: [] }],
    [{ kind: "CREATE_PLAN", intent: "OPEN", fields: {}, explicitCommit: true, unsupportedFields: [] }],
    [{ kind: "CREATE_PLAN", intent: "OPEN", fields: {}, explicitCommit: false, unsupportedFields: [{ field: "primaryContact", userLabel: "yetkili", message: "x", route: "/admin" }] }],
    [{ kind: "STATUS_QUERY", customerId: "fake" }],
    [{ kind: "CANCEL", route: "/admin" }],
  ])("rejects invented fields/actions/ids", (raw) => expect(validateCustomerCreatePlan(raw)).toBeNull());
  it("falls back safely after invalid JSON and extracts the exact acceptance utterance", async () => {
    const utterance = "Yeni müşteri oluştur. Firma adı Arda Yapı olsun. Telefonu 0532 111 22 33 yap. E-posta adresi test@ardayapi.com olsun. Kaydet.";
    await expect(resolveCustomerCreatePlan({ utterance, pendingContext: null, generateText: async () => "not json" })).resolves.toMatchObject({ kind: "CREATE_PLAN", intent: "OPEN_UPDATE_COMMIT", explicitCommit: true, fields: { displayName: "Arda Yapı", phone: "0532 111 22 33", email: "test@ardayapi.com" }, unsupportedFields: [], operation: "CREATE", semantic: { stage: "OPEN_PROVIDE_AND_COMMIT", fallbackUsed: true } });
  });
  it("classifies lifecycle queries and unrelated text", () => {
    expect(extractObviousCustomerCreatePlan("kaydettin mi?")).toEqual({ kind: "STATUS_QUERY" });
    expect(extractObviousCustomerCreatePlan("eksik ne kaldı?")).toEqual({ kind: "MISSING_FIELDS_QUERY" });
    expect(extractObviousCustomerCreatePlan("vazgeç")).toEqual({ kind: "CANCEL" });
    expect(extractObviousCustomerCreatePlan("hava nasıl?")).toEqual({ kind: "NOT_CUSTOMER_CREATE" });
  });
  it("recognizes primary contact through the field registry", () => expect(extractObviousCustomerCreatePlan("METRIX yeni müşteri kaydı aç. Firma ismi Arda Yapı olacak. Yetkilisi Murat Arda. Telefonu 0542 280 91 77.")).toMatchObject({ kind: "CREATE_PLAN", fields: { displayName: "Arda Yapı", phone: "0542 280 91 77", "primaryContact.fullName": "Murat Arda" }, unsupportedFields: [] }));
  it("defers provider commit when a new workflow has no required field payload", async () => {
    const provider = JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN_UPDATE_COMMIT", fields: {}, explicitCommit: true, unsupportedFields: [], operation: "CREATE" });
    await expect(resolveCustomerCreatePlan({ utterance: "Yeni müşteri kaydet.", pendingContext: null, generateText: async () => provider })).resolves.toMatchObject({ intent: "OPEN", explicitCommit: false, semantic: { source: "PROVIDER", stage: "OPEN" } });
  });
  it("turns opportunistic learning into one enrichment source plan", () => expect(extractObviousCustomerCreatePlan("Atlas artık euro ile çalışıyor.")).toMatchObject({ kind: "CREATE_PLAN", operation: "ENRICH", entityReference: "Atlas", fields: { currency: "EUR" } }));
  it.each(["Arda Yapı.", "Arda Yapı", "Firma Arda Yapı.", "Adı Arda Yapı.", "Firma ismi Arda Yapı olacak.", "Firma adı Arda Yapı.", "Arda Yapı olsun."])("fills the sole missing displayName contextually: %s", (utterance) => expect(extractObviousCustomerCreatePlan(utterance, { lifecycle: "COLLECTING", fields: {}, missingFields: ["displayName"] })).toMatchObject({ kind: "CREATE_PLAN", fields: { displayName: "Arda Yapı" } }));
});
