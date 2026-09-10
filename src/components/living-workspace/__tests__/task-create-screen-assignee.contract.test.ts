import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../TaskCreateScreen.tsx", import.meta.url), "utf8");

// Production regression: the Task Create surface had no Assignee field at
// all, so a resolved assigneeUserId could never be hydrated into it (and,
// before the ownership-gate fix, a batch entry for an unregistered target
// caused the whole navigation to be reported FAILED — see
// task-create-conversation-coordinator.ts / ExecutiveNavigationCommandHost's
// apply()). This is a source-contract test (no React render harness in this
// project — see legacy-conversation-ownership.contract.test.ts for the same
// style) asserting the field exists, is a real universal-input target, and
// never renders the raw user id.
describe("TaskCreateScreen — Atanan (assignee) field contract", () => {
  it("registers the canonical assigneeUserId universal input target", () => {
    expect(source).toContain('executiveTargetId: "field.tasks.create.task.assigneeUserId"');
    expect(source).toContain('data-executive-target="field.tasks.create.task.assigneeUserId"');
  });

  it("renders a human-readable member selector, not a raw id input", () => {
    expect(source).toContain("Atanan");
    expect(source).toMatch(/<select[\s\S]*assigneeUserId/);
    expect(source).toContain("member.fullName");
  });

  it("sources the member list from the assignable-members client, not a second membership authority", () => {
    expect(source).toContain("listAssignableMembers");
  });
});
