import { describe, expect, it, vi } from "vitest";

/**
 * FAZ 6 — Cross-domain acceptance testleri.
 *
 * Bu dosya, Faz 4'te Action Runtime'a kapatılan 4 domain'in (Team, Goal,
 * Calendar, Product) TEK TEK handler-seviyesi testlerinden (zaten var,
 * bkz. domains/{team,goals,calendar,products}/__tests__/) FARKLI bir
 * katmanda kanıt sağlar: manifest → gerçek actionRegistry → gerçek
 * composition-root register fonksiyonu → handlerRegistry → handler
 * çağrısı zincirinin UÇTAN UCA kopmadığını, dört domain için TEK TİP bir
 * şekilde, aynı dosyada doğrular. Ayrıca:
 *
 *   - REACHABILITY: her yeni action listPlannableActions()'da (LLM
 *     planner catalogu) elle bağlantı gerekmeden görünüyor mu (yazma
 *     tarafı registry-driven discovery kanıtı).
 *   - APPROVAL/PERMISSION BOUNDARY: her yeni action'ın requiredPermissionSet
 *     ve approvalPolicy'si, kapattığı legacy route'un GERÇEK bugünkü
 *     yetkilendirme durumuyla birebir aynı mı (Murat'ın "approval boundary
 *     değişmemeli" hard kısıtı).
 *   - NOT_FOUND CROSS-DOMAIN ARBITRATION: dört domain'in de eksik-entity
 *     durumunda tek tip biçimde reddettiğini doğrular.
 *   - WRITE/READ CROSS-REFERENCE: Faz 3'te query-authority'ye eklenen
 *     "team"/"goal" domain'lerinin GERÇEKTEN de write tarafında (bu
 *     dosyada test edilen actionRegistry) karşılığı olduğunu, iki fazın
 *     birbirini tutarlı şekilde tamamladığını kanıtlar.
 *   - NEGATIVE CONTROL: uydurma bir action adı ne registry'de ne de
 *     planner catalogunda görünmüyor (yanlışlıkla aşırı-izin verici bir
 *     keşif mekanizması olmadığının kanıtı).
 *
 * Domain-semantic-reachability guard testi (bkz.
 * conversation-extensions/__tests__/domain-semantic-reachability.guard.test.ts)
 * TÜM domain inventory'sinin yapısal kapsamını kanıtlıyor; bu dosya ise
 * yalnızca BU operasyonda kapatılan 4 domain için GERÇEK davranışsal
 * yürütme kanıtı sağlıyor — ikisi tamamlayıcı, biri diğerinin yerine
 * geçmiyor.
 *
 * Not: Product için composition-root'un GERÇEK registerProductActions()
 * fonksiyonu yerine (bu, bu operasyonun kapsamı dışındaki product.create/
 * product.archive'ı da kayıt eder ve onların servis bağımlılıklarını da
 * mock etmeyi gerektirirdi) product-update-handler.ts dosyası doğrudan
 * import edilip, composition root'un kullandığı BİREBİR AYNI koşullu
 * (idempotent) kayıt deseniyle handlerRegistry'ye kaydedilir — bu,
 * registerProductActions() içindeki "if (!registry.hasHandler(...))"
 * satırının birebir kopyasıdır, kapsam gereksiz genişletilmez.
 */

// production-execution-runtime.test.ts ve her domain'in kendi handler
// testleriyle aynı zorunlu prisma guard'ı: handler modülleri servis
// katmanı üzerinden gerçek Prisma client'ı transitive import ediyor,
// DATABASE_URL olmadan mock'lanmadan import edilirse patlar.
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})) },
}));

vi.mock("@/lib/core/notifications", () => ({
  notifyWithOwnerFanout: vi.fn().mockResolvedValue({ notifications: [], additionalTargetResolutions: [] }),
}));

const teamMocks = vi.hoisted(() => ({
  getOwnMembershipId: vi.fn(),
  listOrganizationMembers: vi.fn(),
  manageOrganizationMember: vi.fn(),
}));
vi.mock("@/lib/core/organization-members/organization-member.service", () => teamMocks);

const goalMocks = vi.hoisted(() => ({
  createNewSalesGoal: vi.fn(),
  getSalesGoalByIdForOrganization: vi.fn(),
  updateSalesGoalDetails: vi.fn(),
  archiveSalesGoalById: vi.fn(),
}));
vi.mock("@/lib/core/goals/goal.service", () => goalMocks);

const calendarMocks = vi.hoisted(() => ({
  createCalendarEvent: vi.fn(),
  getCalendarEvent: vi.fn(),
  updateCalendarEventDetails: vi.fn(),
  transitionCalendarEventStatus: vi.fn(),
  rescheduleCalendarEvent: vi.fn(),
}));
vi.mock("@/lib/core/calendar/calendar-event.service", () => calendarMocks);

const productMocks = vi.hoisted(() => ({
  getProductServiceByIdForOrganization: vi.fn(),
  updateProductServiceDetails: vi.fn(),
}));
vi.mock("@/lib/core/products/product.service", () => productMocks);

import { actionRegistry } from "@/lib/action-runtime/registry";
import { createInMemoryHandlerRegistry } from "@/lib/action-runtime/execution";
import type { ActionExecutionEnvelope, ExecutionContext } from "@/lib/action-runtime/execution";
import { registerTeamActions } from "@/lib/action-runtime/domains/team";
import { registerGoalActions } from "@/lib/action-runtime/domains/goals";
import { registerCalendarActions } from "@/lib/action-runtime/domains/calendar";
import { productUpdateHandler } from "@/lib/action-runtime/domains/products/product-update-handler";
import { listPlannableActions } from "@/lib/executive-orchestration/action-catalog";
import { COMPANY_QUERY_COUNT_DOMAINS } from "@/lib/company-query-authority/company-query-plan.types";

function buildContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    actorId: "actor_1",
    organizationId: "org_1",
    role: "OWNER",
    permissions: ["members.manage", "goals.write", "goals.archive", "products.write"],
    sessionRef: "session_1",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-01T01:00:00.000Z",
    ...overrides,
  } as ExecutionContext;
}

function buildEnvelope(
  actionName: string,
  input: Record<string, unknown>,
  overrides: Partial<ActionExecutionEnvelope> = {},
): ActionExecutionEnvelope {
  return {
    executionId: "exec_1",
    actionName,
    input,
    executionContext: buildContext(),
    idempotencyKey: "idem_1",
    startedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ActionExecutionEnvelope;
}

// Faz 4'ün gerçek composition-root register fonksiyonlarını, production
// runtime'ın kullandığı ile birebir aynı şekilde çağırıyoruz — yalnızca
// izole bir handlerRegistry içinde (composition-root'un KENDİSİNİ import
// etmiyoruz, çünkü o diğer ~30 domain'in tamamının servis katmanını da
// transitive import ediyor ve bu dosyanın kapsamı dışında kalan bir mock
// yükü getirirdi).
const handlerRegistry = createInMemoryHandlerRegistry();
registerTeamActions(handlerRegistry);
registerGoalActions(handlerRegistry);
registerCalendarActions(handlerRegistry);
if (!handlerRegistry.hasHandler("product.update")) {
  handlerRegistry.registerHandler("product.update", productUpdateHandler);
}

describe("cross-domain acceptance — Team/Goal/Calendar/Product Action Runtime closure (Faz 6)", () => {
  describe("write-side reachability (registry-driven discovery, no manual planner wiring)", () => {
    const NEW_ACTIONS: ReadonlyArray<{ actionName: string; expectedPermissions: readonly string[] }> = [
      { actionName: "organization_member.update", expectedPermissions: ["members.manage"] },
      { actionName: "goal.create", expectedPermissions: ["goals.write"] },
      { actionName: "goal.update", expectedPermissions: ["goals.write"] },
      { actionName: "goal.archive", expectedPermissions: ["goals.archive"] },
      { actionName: "calendar_event.create", expectedPermissions: [] },
      { actionName: "calendar_event.update", expectedPermissions: [] },
      { actionName: "calendar_event.status_transition", expectedPermissions: [] },
      { actionName: "calendar_event.reschedule", expectedPermissions: [] },
      { actionName: "product.update", expectedPermissions: ["products.write"] },
    ];

    it.each(NEW_ACTIONS)(
      "$actionName is registered in actionRegistry as a DOMAIN action with approvalPolicy NONE",
      ({ actionName }) => {
        expect(actionRegistry.hasAction(actionName)).toBe(true);
        const definition = actionRegistry.getActionDefinition(actionName);
        expect(definition.actionClass).toBe("DOMAIN");
        expect(definition.approvalPolicy).toBe("NONE");
        expect(Object.keys(definition.inputSchema).length).toBeGreaterThan(0);
      },
    );

    it.each(NEW_ACTIONS)(
      "$actionName's requiredPermissionSet matches the legacy route's real authorization exactly (approval boundary unchanged)",
      ({ actionName, expectedPermissions }) => {
        const definition = actionRegistry.getActionDefinition(actionName);
        expect([...definition.requiredPermissionSet]).toEqual([...expectedPermissions]);
      },
    );

    it.each(NEW_ACTIONS)(
      "$actionName is discoverable by the LLM planner catalog with zero manual action-catalog wiring beyond its Turkish description",
      ({ actionName }) => {
        const plannable = listPlannableActions();
        expect(plannable.some((action) => action.actionName === actionName)).toBe(true);
      },
    );

    it("a fictional, never-registered action name is absent from both the registry and the planner catalog (negative control)", () => {
      expect(actionRegistry.hasAction("goal.delete_forever")).toBe(false);
      expect(listPlannableActions().some((action) => action.actionName === "goal.delete_forever")).toBe(false);
    });
  });

  describe("execution proof — manifest -> composition-root register function -> handlerRegistry -> handler, for real", () => {
    it("organization_member.update executes through the exact same registerTeamActions() wiring the production composition root uses", async () => {
      teamMocks.getOwnMembershipId.mockResolvedValue("member_actor");
      teamMocks.listOrganizationMembers.mockResolvedValue([
        { id: "member_target", email: "eda@example.com", fullName: "Eda Yılmaz", role: "EMPLOYEE", status: "ACTIVE" },
      ]);
      teamMocks.manageOrganizationMember.mockResolvedValue({
        id: "member_target", email: "eda@example.com", fullName: "Eda Yılmaz", role: "MANAGER", status: "ACTIVE",
      });

      const handler = handlerRegistry.getHandler("organization_member.update");
      const result = await handler(buildEnvelope("organization_member.update", { memberId: "member_target", role: "MANAGER" }));

      expect(result.status).toBe("SUCCESS");
      expect(result.entityRef).toEqual({ entityType: "organization_member", entityId: "member_target" });
      expect(result.compensationSnapshot).toEqual({ memberId: "member_target", role: "EMPLOYEE" });
    });

    it("goal.create -> goal.update -> goal.archive execute in sequence through the exact same registerGoalActions() wiring the production composition root uses", async () => {
      goalMocks.createNewSalesGoal.mockResolvedValue({ id: "goal_1", title: "Q3 Satış Hedefi", period: "QUARTERLY" });
      const createHandler = handlerRegistry.getHandler("goal.create");
      const createResult = await createHandler(buildEnvelope("goal.create", { title: "Q3 Satış Hedefi", period: "QUARTERLY" }));
      expect(createResult.status).toBe("SUCCESS");
      expect(createResult.entityRef).toEqual({ entityType: "goal", entityId: "goal_1" });

      const existingGoal = {
        id: "goal_1", title: "Q3 Satış Hedefi", period: "QUARTERLY", status: "ACTIVE",
        targetRevenueCents: null, targetCollectionCents: null, startsAt: undefined, endsAt: undefined,
      };
      goalMocks.getSalesGoalByIdForOrganization
        .mockResolvedValueOnce(existingGoal)
        .mockResolvedValueOnce({ ...existingGoal, title: "Q3 Satış Hedefi (Güncel)" });
      goalMocks.updateSalesGoalDetails.mockResolvedValue(undefined);
      const updateHandler = handlerRegistry.getHandler("goal.update");
      const updateResult = await updateHandler(buildEnvelope("goal.update", { goalId: "goal_1", title: "Q3 Satış Hedefi (Güncel)" }));
      expect(updateResult.status).toBe("SUCCESS");
      expect(updateResult.compensationSnapshot).toEqual({ goalId: "goal_1", title: "Q3 Satış Hedefi" });

      goalMocks.getSalesGoalByIdForOrganization.mockReset().mockResolvedValue({ ...existingGoal, status: "ACTIVE" });
      goalMocks.archiveSalesGoalById.mockResolvedValue(undefined);
      const archiveHandler = handlerRegistry.getHandler("goal.archive");
      const archiveResult = await archiveHandler(buildEnvelope("goal.archive", { goalId: "goal_1" }));
      expect(archiveResult.status).toBe("SUCCESS");
      expect(archiveResult.resultOutcome).toBeUndefined();
    });

    it("calendar_event.create -> reschedule -> status_transition -> update execute in sequence through the exact same registerCalendarActions() wiring the production composition root uses", async () => {
      calendarMocks.createCalendarEvent.mockResolvedValue({
        id: "event_1", title: "Müşteri ziyareti",
        startAt: new Date("2026-09-10T09:00:00.000Z"), endAt: new Date("2026-09-10T10:00:00.000Z"),
      });
      const createHandler = handlerRegistry.getHandler("calendar_event.create");
      const createResult = await createHandler(buildEnvelope("calendar_event.create", {
        title: "Müşteri ziyareti", startAt: "2026-09-10T09:00:00.000Z", endAt: "2026-09-10T10:00:00.000Z",
      }));
      expect(createResult.status).toBe("SUCCESS");
      expect(createResult.entityRef).toEqual({ entityType: "calendar_event", entityId: "event_1" });

      calendarMocks.getCalendarEvent.mockResolvedValue({
        id: "event_1", title: "Müşteri ziyareti",
        startAt: new Date("2026-09-10T09:00:00.000Z"), endAt: new Date("2026-09-10T10:00:00.000Z"), allDay: false,
      });
      calendarMocks.rescheduleCalendarEvent.mockResolvedValue({
        startAt: new Date("2026-09-11T09:00:00.000Z"), endAt: new Date("2026-09-11T10:00:00.000Z"),
      });
      const rescheduleHandler = handlerRegistry.getHandler("calendar_event.reschedule");
      const rescheduleResult = await rescheduleHandler(buildEnvelope("calendar_event.reschedule", {
        eventId: "event_1", startAt: "2026-09-11T09:00:00.000Z", endAt: "2026-09-11T10:00:00.000Z",
      }));
      expect(rescheduleResult.status).toBe("SUCCESS");
      expect(rescheduleResult.compensationSnapshot).toEqual({
        eventId: "event_1", startAt: "2026-09-10T09:00:00.000Z", endAt: "2026-09-10T10:00:00.000Z",
      });

      calendarMocks.transitionCalendarEventStatus.mockResolvedValue({ status: "CONFIRMED" });
      const statusHandler = handlerRegistry.getHandler("calendar_event.status_transition");
      const statusResult = await statusHandler(buildEnvelope("calendar_event.status_transition", { eventId: "event_1", toStatus: "CONFIRMED" }));
      expect(statusResult.status).toBe("SUCCESS");
      expect(statusResult.metadata).toEqual({ status: "CONFIRMED" });

      calendarMocks.updateCalendarEventDetails.mockResolvedValue({ id: "event_1" });
      const updateHandler = handlerRegistry.getHandler("calendar_event.update");
      const updateResult = await updateHandler(buildEnvelope("calendar_event.update", { eventId: "event_1", title: "Müşteri ziyareti (güncellendi)" }));
      expect(updateResult.status).toBe("SUCCESS");
      expect(updateResult.compensationSnapshot).toEqual({ eventId: "event_1", title: "Müşteri ziyareti" });
    });

    it("product.update executes through the exact same idempotent-registration pattern the production composition root uses", async () => {
      const before = {
        id: "product_1", name: "Standart Paket", category: "Hizmet", unit: "adet",
        costCents: BigInt(1000), priceCents: BigInt(1500), currency: "TRY", stockBehavior: "TRACKED",
      };
      productMocks.getProductServiceByIdForOrganization
        .mockResolvedValueOnce(before)
        .mockResolvedValueOnce({ ...before, priceCents: BigInt(1800) });
      productMocks.updateProductServiceDetails.mockResolvedValue(undefined);

      const handler = handlerRegistry.getHandler("product.update");
      const result = await handler(buildEnvelope("product.update", { productServiceId: "product_1", priceCents: 1800 }));

      expect(result.status).toBe("SUCCESS");
      expect(result.entityRef).toEqual({ entityType: "product", entityId: "product_1" });
      expect(result.compensationSnapshot).toEqual({ productServiceId: "product_1", priceCents: 1500 });
    });
  });

  describe("NOT_FOUND cross-domain arbitration — every new domain rejects a missing entity uniformly", () => {
    it("organization_member.update rejects an unknown memberId", async () => {
      teamMocks.getOwnMembershipId.mockResolvedValue("member_actor");
      teamMocks.listOrganizationMembers.mockResolvedValue([]);
      const handler = handlerRegistry.getHandler("organization_member.update");
      await expect(
        handler(buildEnvelope("organization_member.update", { memberId: "does_not_exist", role: "MANAGER" })),
      ).rejects.toThrow(/Member not found/);
    });

    it("goal.update rejects an unknown goalId", async () => {
      goalMocks.getSalesGoalByIdForOrganization.mockReset().mockResolvedValue(null);
      const handler = handlerRegistry.getHandler("goal.update");
      await expect(
        handler(buildEnvelope("goal.update", { goalId: "does_not_exist", title: "X" })),
      ).rejects.toThrow(/Goal not found/);
    });

    it("calendar_event.update rejects an unknown eventId", async () => {
      calendarMocks.getCalendarEvent.mockResolvedValue(null);
      const handler = handlerRegistry.getHandler("calendar_event.update");
      await expect(
        handler(buildEnvelope("calendar_event.update", { eventId: "does_not_exist", title: "X" })),
      ).rejects.toThrow(/Calendar event not found/);
    });

    it("product.update rejects an unknown productServiceId", async () => {
      productMocks.getProductServiceByIdForOrganization.mockReset().mockResolvedValue(null);
      const handler = handlerRegistry.getHandler("product.update");
      await expect(
        handler(buildEnvelope("product.update", { productServiceId: "does_not_exist", name: "X" })),
      ).rejects.toThrow(/Product not found/);
    });
  });

  describe("write/read cross-reference — Faz 3's newly query-able domains genuinely have write-side canonical capability", () => {
    it("every domain company-query-authority added this operation ('team', 'goal') has a corresponding real DOMAIN action in actionRegistry", () => {
      const newlyAddedQueryDomains = ["team", "goal"] as const;
      expect([...COMPANY_QUERY_COUNT_DOMAINS]).toEqual(expect.arrayContaining([...newlyAddedQueryDomains]));

      for (const domain of newlyAddedQueryDomains) {
        const prefix = domain === "team" ? "organization_member." : "goal.";
        const hasRealAction = actionRegistry
          .listAllActions()
          .some((definition) => definition.actionName.startsWith(prefix) && definition.actionClass === "DOMAIN");
        expect(hasRealAction).toBe(true);
      }
    });
  });
});
