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
});
