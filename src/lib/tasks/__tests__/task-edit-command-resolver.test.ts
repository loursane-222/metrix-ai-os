import { describe, expect, it, vi } from "vitest";
import { resolveTaskEditCommand } from "../task-edit-command-resolver";

describe("resolveTaskEditCommand", () => {
  it("resolves an open task complete command", async () => {
    const generateText = vi.fn(async () => '{"result":"executable","action":"complete"}');
    await expect(resolveTaskEditCommand({ utterance: "görevi tamamla", activeTab: "actions", context: { title: "Haftalık rapor", status: "OPEN" }, generateText })).resolves.toEqual({ kind: "resolved", resolution: { kind: "executable", command: { type: "complete" } } });
  });

  it.each(["DONE", "CANCELLED"])("returns unsupported without consulting the model for %s", async (status) => {
    const generateText = vi.fn(async () => '{"result":"executable","action":"complete"}');
    await expect(resolveTaskEditCommand({ utterance: "tamamla", activeTab: "actions", context: { title: "Haftalık rapor", status }, generateText })).resolves.toEqual({ kind: "resolved", resolution: { kind: "unsupported" } });
    expect(generateText).not.toHaveBeenCalled();
  });
});
