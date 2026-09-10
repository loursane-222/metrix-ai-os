import { describe, expect, it } from "vitest";
import { extractObviousTaskCreatePlan } from "../task-create-conversation-planner";

describe("extractObviousTaskCreatePlan", () => {
  it("returns NOT_TASK_CREATE for unrelated messages with no pending context", () => {
    expect(extractObviousTaskCreatePlan("bugün hava nasıl?")).toEqual({ kind: "NOT_TASK_CREATE" });
  });

  it("extracts a title from an explicit create trigger", () => {
    const plan = extractObviousTaskCreatePlan("yeni görev oluştur: teklifi müşteriye gönder");
    expect(plan.kind).toBe("CREATE_PLAN");
    if (plan.kind === "CREATE_PLAN") {
      expect(plan.fields.title).toBe("teklifi müşteriye gönder");
      expect(plan.explicitCommit).toBe(true);
    }
  });

  it("extracts a relative due date without fabricating one when absent", () => {
    const withDate = extractObviousTaskCreatePlan("görev oluştur: raporu yarına kadar bitir");
    expect(withDate.kind).toBe("CREATE_PLAN");
    if (withDate.kind === "CREATE_PLAN") expect(withDate.fields.dueDate).toBeDefined();

    const withoutDate = extractObviousTaskCreatePlan("görev oluştur: raporu bitir");
    expect(withoutDate.kind).toBe("CREATE_PLAN");
    if (withoutDate.kind === "CREATE_PLAN") expect(withoutDate.fields.dueDate).toBeUndefined();
  });

  it("recognizes cancel and status queries only when a draft is pending", () => {
    const pending = { lifecycle: "COLLECTING" as const, fields: {} };
    expect(extractObviousTaskCreatePlan("vazgeç", pending)).toEqual({ kind: "CANCEL" });
    expect(extractObviousTaskCreatePlan("vazgeç", null)).toEqual({ kind: "NOT_TASK_CREATE" });
  });

  // Production regression: Turkish is verb-final, so the create trigger
  // routinely lands at the END of the utterance, not the start — the exact
  // production request that opened an empty "Yeni Görev" workspace instead
  // of creating the task directly.
  describe("verb-final Turkish phrasing (production regression)", () => {
    it("recognizes the exact production regression utterance as a fresh, explicit, self-assigned task", () => {
      const plan = extractObviousTaskCreatePlan("Yarın bana Ahmet müşterisini aramam için görev oluştur.");
      expect(plan.kind).toBe("CREATE_PLAN");
      if (plan.kind !== "CREATE_PLAN") return;
      expect(plan.explicitCommit).toBe(true);
      expect(plan.fields.title).toBeTruthy();
      expect(plan.fields.dueDate).toBeDefined();
      expect(plan.assigneeReference).toBe("SELF");
    });

    it("recognizes a task-creation trigger glued to a Turkish possessive suffix (\"görevi oluştur\")", () => {
      expect(extractObviousTaskCreatePlan("Bir takip görevi oluştur.").kind).toBe("CREATE_PLAN");
    });

    it("does not false-positive on words that merely contain the trigger stem (\"hatırlatma\")", () => {
      expect(extractObviousTaskCreatePlan("hatırlatma ayarla lütfen")).toEqual({ kind: "NOT_TASK_CREATE" });
    });

    it("leaves assigneeReference null when no assignee is referenced", () => {
      const plan = extractObviousTaskCreatePlan("görev oluştur: raporu bitir");
      expect(plan.kind).toBe("CREATE_PLAN");
      if (plan.kind === "CREATE_PLAN") expect(plan.assigneeReference).toBeNull();
    });
  });
});
