import { describe, expect, it } from "vitest";
import { validateCustomerCreatePlan } from "../customer-create-conversation-plan";
import { extractObviousCustomerCreatePlan, resolveCustomerCreatePlan } from "../customer-create-conversation-planner";
describe("customer create conversation planner", () => {
  it("accepts strict multi-field JSON and preserves Turkish values", async () => {
    const plan = await resolveCustomerCreatePlan({ utterance: "Yeni müşteri oluştur ve kaydet.", pendingContext: null, generateText: async () => JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN_UPDATE_COMMIT", fields: { displayName: "Arda Yapı", legalName: "Arda Yapı İnşaat AŞ", phone: "0532 111 22 33", email: "test@ardayapi.com" }, explicitCommit: true, unsupportedFields: [], operation: "CREATE" }) });
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
    const pending = { lifecycle: "COLLECTING" as const, fields: {}, missingFields: ["displayName" as const] };
    expect(extractObviousCustomerCreatePlan("kaydettin mi?", pending)).toEqual({ kind: "STATUS_QUERY" });
    expect(extractObviousCustomerCreatePlan("eksik ne kaldı?", pending)).toEqual({ kind: "MISSING_FIELDS_QUERY" });
    expect(extractObviousCustomerCreatePlan("vazgeç", pending)).toEqual({ kind: "CANCEL" });
    expect(extractObviousCustomerCreatePlan("kaydettin mi?")).toEqual({ kind: "NOT_CUSTOMER_CREATE" });
    expect(extractObviousCustomerCreatePlan("hava nasıl?")).toEqual({ kind: "NOT_CUSTOMER_CREATE" });
    expect(extractObviousCustomerCreatePlan("Atlas müşterisini aç.")).toEqual({ kind: "NOT_CUSTOMER_CREATE" });
    expect(extractObviousCustomerCreatePlan("Atlas müşterisini göster.")).toEqual({ kind: "NOT_CUSTOMER_CREATE" });
    expect(extractObviousCustomerCreatePlan("Atlas müşterisini düzenle.")).toEqual({ kind: "NOT_CUSTOMER_CREATE" });
  });
  it("rejects a provider CREATE claim without create-workflow semantic evidence", async () => {
    const provider = JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN", fields: { displayName: "Atlas" }, explicitCommit: false, unsupportedFields: [], operation: "CREATE" });
    await expect(resolveCustomerCreatePlan({ utterance: "Atlas müşterisini aç.", pendingContext: null, generateText: async () => provider })).resolves.toEqual({ kind: "NOT_CUSTOMER_CREATE" });
  });
  it("recognizes primary contact through the field registry", () => expect(extractObviousCustomerCreatePlan("METRIX yeni müşteri kaydı aç. Firma ismi Arda Yapı olacak. Yetkilisi Murat Arda. Telefonu 0542 280 91 77.")).toMatchObject({ kind: "CREATE_PLAN", fields: { displayName: "Arda Yapı", "primaryContact.fullName": "Murat Arda", "primaryContact.phone": "0542 280 91 77" }, unsupportedFields: [] }));
  it("attributes a phone/email mentioned right after the primary contact to the contact, not the company (production regression)", () => {
    // Exact shape of the reported production incident: a separate "Telefon:"
    // line with no "firma"/"yetkili" qualifier of its own, immediately after
    // a "Yetkili:" line — must land on primaryContact.phone, never the
    // top-level company phone.
    const utterance = "METRIX yeni müşteri kaydı aç. Firma ismi Claude Test olacak. Yetkili: Hakan Arda. Telefon: 0539 985 4475. Email: hakan@test.com.";
    const plan = extractObviousCustomerCreatePlan(utterance);
    expect(plan).toMatchObject({
      kind: "CREATE_PLAN",
      fields: { displayName: "Claude Test", "primaryContact.fullName": "Hakan Arda", "primaryContact.phone": "0539 985 4475", "primaryContact.email": "hakan@test.com" },
    });
    if (plan.kind === "CREATE_PLAN") {
      expect(plan.fields.phone).toBeUndefined();
      expect(plan.fields.email).toBeUndefined();
    }
  });
  it("still attributes an explicitly-qualified company phone to the company even after a primary contact was named", () => {
    const utterance = "METRIX yeni müşteri kaydı aç. Firma ismi Arda Yapı olacak. Yetkilisi Murat Arda. Firma telefonu 0212 555 00 00.";
    const plan = extractObviousCustomerCreatePlan(utterance);
    expect(plan).toMatchObject({ kind: "CREATE_PLAN", fields: { "primaryContact.fullName": "Murat Arda", phone: "0212 555 00 00" } });
    if (plan.kind === "CREATE_PLAN") expect(plan.fields["primaryContact.phone"]).toBeUndefined();
  });
  it("keeps a bare company phone (no contact mentioned) at the top level", () => {
    const plan = extractObviousCustomerCreatePlan("METRIX yeni müşteri kaydı aç. Firma ismi Test Firma olacak. Telefon: 0532 111 22 33.");
    expect(plan).toMatchObject({ kind: "CREATE_PLAN", fields: { displayName: "Test Firma", phone: "0532 111 22 33" } });
  });
  it("defers provider commit when a new workflow has no required field payload", async () => {
    const provider = JSON.stringify({ kind: "CREATE_PLAN", intent: "OPEN_UPDATE_COMMIT", fields: {}, explicitCommit: true, unsupportedFields: [], operation: "CREATE" });
    await expect(resolveCustomerCreatePlan({ utterance: "Yeni müşteri kaydet.", pendingContext: null, generateText: async () => provider })).resolves.toMatchObject({ intent: "OPEN", explicitCommit: false, semantic: { source: "PROVIDER", stage: "OPEN" } });
  });
  it("turns opportunistic learning into one enrichment source plan", () => expect(extractObviousCustomerCreatePlan("Atlas artık euro ile çalışıyor.")).toMatchObject({ kind: "CREATE_PLAN", operation: "ENRICH", entityReference: "Atlas", fields: { currency: "EUR" } }));
  it("overrides an incomplete provider envelope with deterministic multi-sentence semantic evidence", async () => {
    const utterance = "Atlas artık euro ile çalışıyor. Önümüzdeki hafta da yeni fiyat teklifi istemeleri muhtemel.";
    const provider = JSON.stringify({ kind: "CREATE_PLAN", intent: "UPDATE_DRAFT", fields: {}, explicitCommit: false, unsupportedFields: [], operation: "UPDATE" });
    await expect(resolveCustomerCreatePlan({ utterance, pendingContext: null, generateText: async () => provider })).resolves.toMatchObject({
      operation: "ENRICH", entityReference: "Atlas", fields: { currency: "EUR" },
      semantic: { source: "PROVIDER", probableClauseCount: 1 },
    });
  });
  it.each(["Arda Yapı.", "Arda Yapı", "Firma Arda Yapı.", "Adı Arda Yapı.", "Firma ismi Arda Yapı olacak.", "Firma adı Arda Yapı.", "Arda Yapı olsun."])("fills the sole missing displayName contextually: %s", (utterance) => expect(extractObviousCustomerCreatePlan(utterance, { lifecycle: "COLLECTING", fields: {}, missingFields: ["displayName"] })).toMatchObject({ kind: "CREATE_PLAN", fields: { displayName: "Arda Yapı" } }));
  it("overrides a provider MISSING_FIELDS_QUERY misclassification with the deterministic displayName fill (production regression)", async () => {
    const pendingContext = { lifecycle: "OPENING" as const, fields: {}, missingFields: ["displayName" as const] };
    const provider = JSON.stringify({ kind: "MISSING_FIELDS_QUERY" });
    await expect(resolveCustomerCreatePlan({ utterance: "Firma adı Atlas olsun.", pendingContext, generateText: async () => provider })).resolves.toMatchObject({ kind: "CREATE_PLAN", fields: { displayName: "Atlas" } });
  });
  it("keeps a provider MISSING_FIELDS_QUERY when the utterance is genuinely a status query", async () => {
    const pendingContext = { lifecycle: "COLLECTING" as const, fields: {}, missingFields: ["displayName" as const] };
    const provider = JSON.stringify({ kind: "MISSING_FIELDS_QUERY" });
    await expect(resolveCustomerCreatePlan({ utterance: "Eksik ne kaldı?", pendingContext, generateText: async () => provider })).resolves.toEqual({ kind: "MISSING_FIELDS_QUERY" });
  });
});
