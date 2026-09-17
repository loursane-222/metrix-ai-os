import { describe, expect, it } from "vitest";

import { projectCapabilityResults } from "../../src/lib/presentation/project-result";

describe("generic presentation projection", () => {
  it("projects a canonical lookup result as a generic list without a workspace domain", () => {
    const presentations = projectCapabilityResults([
      {
        capability: "customer_lookup",
        operation: "read",
        data: {
          count: 2,
          customers: [
            { id: "c1", name: "Atlas İnşaat", email: "a@example.test" },
            { id: "c2", name: "Belgin Tekstil", email: "b@example.test" }
          ]
        }
      }
    ]);

    expect(presentations).toHaveLength(1);
    expect(presentations[0]).toMatchObject({
      type: "LIST",
      title: "Müşteriler",
      rows: [
        { id: "c1", primary: "Atlas İnşaat" },
        { id: "c2", primary: "Belgin Tekstil" }
      ]
    });
    expect(JSON.stringify(presentations[0])).not.toContain("Workspace");
  });

  it("projects a calendar_list result as a CALENDAR view carrying the query mode and reference date", () => {
    const presentations = projectCapabilityResults([
      {
        capability: "calendar_list",
        operation: "read",
        data: {
          source: "COMPANY_REALITY",
          mode: "WEEK",
          referenceDate: "2026-09-14T00:00:00.000Z",
          events: [
            { id: "e1", title: "Ahmet ile toplantı", startsAt: "2026-09-17T14:00:00.000Z", endsAt: "2026-09-17T14:30:00.000Z", allDay: false }
          ]
        }
      }
    ]);

    expect(presentations).toHaveLength(1);
    expect(presentations[0]).toMatchObject({
      type: "CALENDAR",
      title: "Takvim",
      mode: "WEEK",
      referenceDate: "2026-09-14T00:00:00.000Z",
      events: [{ id: "e1", title: "Ahmet ile toplantı", allDay: false }]
    });
  });

  it("projects a document_generate result as a DOCUMENT view carrying the artifact's version and preview", () => {
    const presentations = projectCapabilityResults([
      {
        capability: "document_generate",
        operation: "mutation",
        data: {
          action: "document.generate",
          status: "VERIFIED",
          verified: true,
          replayed: false,
          document: {
            artifactId: "art_1",
            kind: "OFFER",
            sourceType: "Quote",
            sourceId: "q1",
            version: 1,
            title: "Teklif",
            previewHtml: "<!doctype html><html><body>Teklif</body></html>"
          }
        }
      }
    ]);

    expect(presentations).toHaveLength(1);
    expect(presentations[0]).toMatchObject({
      type: "DOCUMENT",
      title: "Belge",
      artifactId: "art_1",
      version: 1,
      previewHtml: "<!doctype html><html><body>Teklif</body></html>"
    });
  });

  // Root-cause regression for the physical Reality Gate presentation
  // finding: a scheduled task create/update, or a list narrowed to
  // exactly one scheduled task, used to render as a raw ENTITY/LIST card
  // (internal ids, raw UTC dueAt) instead of the existing calendar view.
  it("projects a scheduled task_create result as a CALENDAR day view, not a raw ENTITY card", () => {
    const presentations = projectCapabilityResults([
      {
        capability: "task_create",
        operation: "mutation",
        data: {
          action: "task.create",
          status: "VERIFIED",
          verified: true,
          replayed: false,
          task: {
            id: "task_1",
            organizationId: "org_1",
            title: "Reality Gate",
            priority: "HIGH",
            status: "OPEN",
            dueAt: "2026-09-18T12:00:00.000Z",
            assignedToUserId: "user_1"
          }
        }
      }
    ]);

    expect(presentations).toHaveLength(1);
    expect(presentations[0]).toEqual({
      type: "CALENDAR",
      title: "Görev",
      mode: "DAY",
      referenceDate: "2026-09-18T12:00:00.000Z",
      events: [
        {
          id: "task_1",
          title: "Reality Gate",
          startsAt: "2026-09-18T12:00:00.000Z",
          endsAt: "2026-09-18T12:00:00.000Z",
          allDay: false
        }
      ]
    });
  });

  it("projects a scheduled task_update result as a CALENDAR day view", () => {
    const presentations = projectCapabilityResults([
      {
        capability: "task_update",
        operation: "mutation",
        data: {
          action: "task.update",
          status: "VERIFIED",
          verified: true,
          replayed: false,
          task: {
            id: "task_1",
            organizationId: "org_1",
            title: "Deneme",
            priority: "HIGH",
            status: "OPEN",
            dueAt: "2026-09-18T11:00:00.000Z",
            assignedToUserId: "user_1"
          }
        }
      }
    ]);

    expect(presentations[0]).toMatchObject({
      type: "CALENDAR",
      mode: "DAY",
      referenceDate: "2026-09-18T11:00:00.000Z",
      events: [
        { id: "task_1", title: "Deneme", startsAt: "2026-09-18T11:00:00.000Z" }
      ]
    });
  });

  it("projects a task_list result narrowed to exactly one scheduled task as CALENDAR — the 'az önce oluşturduğumuz X görevini göster' case", () => {
    const presentations = projectCapabilityResults([
      {
        capability: "task_list",
        operation: "read",
        data: {
          source: "COMPANY_REALITY",
          count: 1,
          tasks: [
            {
              id: "task_1",
              organizationId: "org_1",
              title: "Deneme",
              status: "OPEN",
              priority: "HIGH",
              dueAt: "2026-09-18T11:00:00.000Z",
              createdAt: "2026-09-17T18:42:33.797Z"
            }
          ]
        }
      }
    ]);

    expect(presentations[0]).toMatchObject({
      type: "CALENDAR",
      title: "Görevler",
      mode: "DAY",
      events: [{ id: "task_1", title: "Deneme" }]
    });
  });

  it("keeps an ordinary task_list (no due date, or more than one task) as LIST — never blindly turns every list into a calendar", () => {
    const noDueDate = projectCapabilityResults([
      {
        capability: "task_list",
        operation: "read",
        data: {
          source: "COMPANY_REALITY",
          count: 1,
          tasks: [
            { id: "task_1", title: "Undated task", status: "OPEN", priority: "MEDIUM", dueAt: null }
          ]
        }
      }
    ]);

    expect(noDueDate[0]).toMatchObject({ type: "LIST", title: "Görevler" });

    const emptyList = projectCapabilityResults([
      {
        capability: "task_list",
        operation: "read",
        data: { source: "COMPANY_REALITY", count: 0, tasks: [] }
      }
    ]);

    expect(emptyList[0]).toMatchObject({ type: "LIST", rows: [] });

    const multipleTasks = projectCapabilityResults([
      {
        capability: "task_list",
        operation: "read",
        data: {
          source: "COMPANY_REALITY",
          count: 2,
          tasks: [
            { id: "task_1", title: "First", status: "OPEN", priority: "HIGH", dueAt: "2026-09-18T11:00:00.000Z" },
            { id: "task_2", title: "Second", status: "OPEN", priority: "LOW", dueAt: "2026-09-19T09:00:00.000Z" }
          ]
        }
      }
    ]);

    expect(multipleTasks[0]).toMatchObject({ type: "LIST", title: "Görevler" });
  });

  it("never lets an internal identifier field appear as a visible ENTITY field, while the canonical data keeps every id untouched", () => {
    const customerCreateData = {
      action: "customer.create",
      status: "VERIFIED",
      verified: true,
      replayed: false,
      customer: {
        id: "cust_1",
        organizationId: "org_1",
        createdByUserId: "user_1",
        name: "Belgin Tekstil",
        email: "belgin@example.test"
      }
    };

    const results = [
      {
        capability: "customer_create" as const,
        operation: "mutation" as const,
        data: customerCreateData
      }
    ];

    const presentations = projectCapabilityResults(results);

    expect(presentations[0]).toMatchObject({
      type: "ENTITY",
      title: "Müşteri"
    });

    const entity = presentations[0] as { fields: { label: string; value: string }[] };

    const visibleLabels = entity.fields.map(field => field.label);

    expect(visibleLabels).not.toContain("Id");
    expect(visibleLabels).not.toContain("Organization id");
    expect(visibleLabels).not.toContain("Created by user id");
    expect(visibleLabels).toContain("Name");
    expect(visibleLabels).toContain("Email");

    // Canonical data is read, never mutated — the original result the
    // caller holds still has every internal id, exactly as before
    // projection. Presentation is a read-only view, not a rewrite.
    expect(customerCreateData.customer.id).toBe("cust_1");
    expect(customerCreateData.customer.organizationId).toBe("org_1");
    expect(customerCreateData.customer.createdByUserId).toBe("user_1");
    expect(results[0]!.data).toBe(customerCreateData);

    // The EntityView's own `raw` — kept for internal correlation, never
    // rendered by MetrixViewSurface — also keeps every id, full fidelity.
    // Only the human-facing `fields` list above is filtered.
    const entityView =
      presentations[0] as { raw: Record<string, unknown> };

    expect(entityView.raw.id).toBe("cust_1");
    expect(entityView.raw.organizationId).toBe("org_1");
    expect(entityView.raw.createdByUserId).toBe("user_1");
  });

  it("is a pure function of its input — calling it twice with the same canonical results produces the same presentation", () => {
    const results = [
      {
        capability: "task_list" as const,
        operation: "read" as const,
        data: {
          source: "COMPANY_REALITY",
          count: 1,
          tasks: [{ id: "task_1", title: "Deneme", dueAt: "2026-09-18T11:00:00.000Z" }]
        }
      }
    ];

    const first = projectCapabilityResults(results);
    const second = projectCapabilityResults(results);

    expect(first).toEqual(second);
  });
});
