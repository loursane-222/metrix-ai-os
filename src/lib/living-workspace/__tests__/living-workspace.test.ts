import { describe, expect, it } from "vitest";
import { validateWorkspaceDirective, type WorkspaceDomain } from "../contracts";
import { createCustomerWorkspaceDirective, createDocumentWorkspaceDirective, createInvoiceWorkspaceDirective, createKpiWorkspaceDirective, createNotificationWorkspaceDirective, createOfferWorkspaceDirective, createPaymentWorkspaceDirective, createReportWorkspaceDirective, createTaskWorkspaceDirective, createWorkspaceDirective } from "../planner";
import { LivingWorkspaceRuntime } from "../runtime";
import { DOMAIN_SURFACE_ADAPTERS } from "../domain-adapters";

const base = () => createWorkspaceDirective({ domain: "customer", source: "written", correlationId: "c-1", now: new Date("2026-01-01T00:00:00Z") });

describe("Living Workspace authority", () => {
  it("registers the notification domain through the same canonical directive authority", () => {
    const directive = createWorkspaceDirective({ domain: "notification", source: "system", correlationId: "n-1", now: new Date("2026-01-01T00:00:00Z") });
    expect(validateWorkspaceDirective(directive)).toEqual(directive);
    expect(directive.navigationRoute).toBe("/metrix/notifications");
    expect(createNotificationWorkspaceDirective({ route: "/metrix/notifications", source: "written", correlationId: "notification-list" })).toMatchObject({ domain: "notification", navigationRoute: "/metrix/notifications" });
  });

  it("registers the task domain and its create businessSurface through the same canonical authority", () => {
    const directive = createWorkspaceDirective({ domain: "task", source: "system", correlationId: "t-1", now: new Date("2026-01-01T00:00:00Z") });
    expect(validateWorkspaceDirective(directive)).toEqual(directive);
    expect(directive.navigationRoute).toBe("/metrix/tasks");
    const createDirective = { ...directive, businessSurface: "task-create" as const, navigationRoute: "/metrix/tasks/new" };
    expect(validateWorkspaceDirective(createDirective)).toEqual(createDirective);
    expect(validateWorkspaceDirective({ ...directive, domain: "customer" as const, businessSurface: "task-create" as const })).toBeNull();
  });

  it("accepts strict allowlisted directives and rejects free HTML, components, domains, fields and actions", () => {
    const valid = base(); expect(validateWorkspaceDirective(valid)).toEqual(valid);
    expect(validateWorkspaceDirective({ ...valid, html: "<script/>" })).toBeNull();
    expect(validateWorkspaceDirective({ ...valid, domain: "admin" })).toBeNull();
    expect(validateWorkspaceDirective({ ...valid, surfaces: [{ ...valid.surfaces[0], columns: ["password"] }] })).toBeNull();
    expect(validateWorkspaceDirective({ ...valid, surfaces: [{ ...valid.surfaces[0], actions: ["delete-all"] }] })).toBeNull();
  });
  it("rejects stale directives, supersedes current and returns to previous focus", () => {
    const runtime = new LivingWorkspaceRuntime();
    expect(runtime.publish(base())).toBe(false);
    const now = new Date();
    const current = createWorkspaceDirective({ domain: "customer", source: "written", correlationId: "a", now });
    const next = createWorkspaceDirective({ domain: "product", source: "written", correlationId: "b", now: new Date(now.getTime() + 1) });
    expect(runtime.publish(current)).toBe(true); expect(runtime.publish(next)).toBe(true); expect(runtime.getSnapshot()?.domain).toBe("product");
    expect(runtime.back()).toBe(true); expect(runtime.getSnapshot()?.domain).toBe("customer");
  });
  it("produces identical presentation for an already-resolved text or voice command", () => {
    const now = new Date();
    const written = createWorkspaceDirective({ domain: "product", source: "written", correlationId: "w", now });
    const voice = createWorkspaceDirective({ domain: "product", source: "voice", correlationId: "v", now });
    const comparable = (value: typeof written) => ({ ...value, directiveId: "", correlationId: "", source: "", primarySurfaceId: "", surfaces: value.surfaces.map((surface) => ({ ...surface, surfaceId: "" })) });
    expect(comparable(written)).toEqual(comparable(voice));
  });
  it("does not accept natural-language utterances as planner input", () => {
    expect(createWorkspaceDirective.length).toBe(1);
    expect(JSON.stringify(base())).not.toContain("utterance");
  });
  it("uses neutral inline presentation unless the caller explicitly supplies a mode", () => {
    expect(base().presentationMode).toBe("inline");
    expect(createWorkspaceDirective({ domain: "customer", source: "written", correlationId: "split", presentationMode: "split" }).presentationMode).toBe("split");
  });
  it("projects resolved customer routes into real Living Surface directives", () => {
    const now = new Date();
    expect(createCustomerWorkspaceDirective({ route: "/metrix/customers", source: "written", correlationId: "list", now })?.businessSurface).toBe("customer-list");
    expect(createCustomerWorkspaceDirective({ route: "/metrix/customers/new", source: "voice", correlationId: "create", now })?.businessSurface).toBe("customer-create");
    const edit = createCustomerWorkspaceDirective({ route: "/metrix/customers/customer-1/edit", source: "written", correlationId: "edit", now });
    expect(edit?.businessSurface).toBe("customer-edit");
    expect(edit?.entityId).toBe("customer-1");
    expect(edit?.presentationMode).toBe("inline");
    expect(validateWorkspaceDirective(edit)).toEqual(edit);
  });

  it("assigns canonical list presentation explicitly instead of falling through to the generic renderer", () => {
    expect(createTaskWorkspaceDirective({ route: "/metrix/tasks", source: "written", correlationId: "tasks" })?.businessSurface).toBe("task-list");
    expect(createOfferWorkspaceDirective({ route: "/metrix/offers", source: "written", correlationId: "offers" })?.businessSurface).toBe("offer-list");
    expect(createPaymentWorkspaceDirective({ route: "/metrix/collections", source: "written", correlationId: "payments" })?.businessSurface).toBe("payment-list");
    expect(createInvoiceWorkspaceDirective({ route: "/metrix/invoices", source: "written", correlationId: "invoices" })?.businessSurface).toBe("invoice-list");
  });

  // Regression: LivingWorkspaceHost's generic list surface used to read rows
  // through a hand-written `record.customers ?? record.products ?? ...`
  // chain that only covered whichever domains someone remembered to add —
  // "offer" was missing (its API responds under "quotes", not "offers",
  // since the Prisma model is Quote), so the Teklifler surface always
  // rendered "Kayıt bulunamadı" regardless of real data, while the chat's
  // own answer (a separate evidence pipeline) correctly named real offers —
  // a visible Workspace/Conversation entity-consistency break. Every domain
  // must have a real, non-empty responseKey so a future domain can't repeat
  // this by omission.
  it("gives every workspace domain a real responseKey for the generic list reader", () => {
    const domains = Object.keys(DOMAIN_SURFACE_ADAPTERS) as WorkspaceDomain[];
    for (const domain of domains) {
      expect(DOMAIN_SURFACE_ADAPTERS[domain].responseKey).toEqual(expect.stringMatching(/^[a-z]+$/));
    }
  });
  it("maps offer's responseKey to its actual API response shape (quotes, not offers)", () => {
    expect(DOMAIN_SURFACE_ADAPTERS.offer.responseKey).toBe("quotes");
  });

  it("registers the report domain (management-summary) through the same canonical directive authority", () => {
    const directive = createWorkspaceDirective({ domain: "report", source: "system", correlationId: "r-1", now: new Date("2026-01-01T00:00:00Z") });
    expect(validateWorkspaceDirective(directive)).toEqual(directive);
    expect(directive.navigationRoute).toBe("/metrix/reports");
    expect(directive.surfaces[0].type).toBe("management-summary");
    expect(createReportWorkspaceDirective({ route: "/metrix/reports", source: "written", correlationId: "report-root" })).toMatchObject({ domain: "report", navigationRoute: "/metrix/reports" });
    expect(DOMAIN_SURFACE_ADAPTERS.report.endpoint).toBe("/api/reports/board");
  });

  it("registers the document domain (entity-list) through the same canonical directive authority", () => {
    expect(createDocumentWorkspaceDirective({ route: "/metrix/documents", source: "written", correlationId: "documents" })?.businessSurface).toBe("document-list");
    expect(DOMAIN_SURFACE_ADAPTERS.document.endpoint).toBe("/api/documents");
    expect(DOMAIN_SURFACE_ADAPTERS.document.responseKey).toBe("documents");
  });

  it("registers the kpi domain (entity-list) through the same canonical directive authority", () => {
    expect(createKpiWorkspaceDirective({ route: "/metrix/kpis", source: "written", correlationId: "kpis" })?.businessSurface).toBe("kpi-list");
    expect(DOMAIN_SURFACE_ADAPTERS.kpi.endpoint).toBe("/api/kpis");
    expect(DOMAIN_SURFACE_ADAPTERS.kpi.responseKey).toBe("kpis");
  });

  // Regression: a re-navigation to a surface that's already open (any
  // non-calendar domain — customer, offer, order, stock...) used to skip
  // republishing entirely to avoid full-panel churn, but that left the
  // presented directive's correlationId stuck on the PREVIOUS turn's value.
  // LivingWorkspaceHost's completePresented()/failPresentation() guards
  // require navigationCommand.correlationId === directive.correlationId, so
  // that mismatch meant the command could never reach COMPLETED and always
  // fell through to its 10s EXPIRED fallback sentence. retarget() re-stamps
  // just the correlationId onto the existing directive, without publish()'s
  // history push or surfaceOpen reset, so completion can succeed.
  it("retargets the current directive's correlationId without churning surfaceOpen or directiveId", () => {
    const runtime = new LivingWorkspaceRuntime();
    const directive = createCustomerWorkspaceDirective({ route: "/metrix/customers", source: "written", correlationId: "turn-1" })!;
    expect(runtime.publish(directive)).toBe(true);
    runtime.setSurfaceOpen(true);
    expect(runtime.retarget("turn-2")).toBe(true);
    const retargeted = runtime.getSnapshot();
    expect(retargeted?.correlationId).toBe("turn-2");
    expect(retargeted?.directiveId).toBe(directive.directiveId);
    expect(runtime.getSurfaceOpenSnapshot()).toBe(true);
  });
  it("does nothing when retargeting with no current directive", () => {
    const runtime = new LivingWorkspaceRuntime();
    expect(runtime.retarget("turn-1")).toBe(false);
    expect(runtime.getSnapshot()).toBeNull();
  });
});
