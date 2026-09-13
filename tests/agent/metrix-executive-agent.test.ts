import {
  existsSync,
  readFileSync
} from "node:fs";

import {
  join
} from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";

const implementationPath = join(
  process.cwd(),
  "src/lib/agent/metrix-executive-agent.ts"
);

const implementationExists =
  existsSync(implementationPath);

describe("single METRIX Executive Agent", () => {
  it("requires the executive agent implementation", () => {
    expect(implementationExists).toBe(true);
  });

  it("constructs one METRIX agent with the native task tool", async () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const {
      createMetrixExecutiveAgent
    } = await import(
      "../../src/lib/agent/metrix-executive-agent"
    );

    const agent =
      createMetrixExecutiveAgent();

    expect(agent.name).toBe("METRIX");

    const toolNames =
      agent.tools.map(
        (tool) => tool.name
      );

    expect(toolNames).toEqual([
      "task_create",
      "customer_lookup"
    ]);
  });

  it("contains no custom semantic router, classifier, planner, or narrator", () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const source =
      readFileSync(
        implementationPath,
        "utf8"
      );

    expect(source).not.toMatch(
      /classifyConversation|semanticRouter|conversationRouter|plannerRouter|intentClassifier|narrationLayer|responseNarrator/
    );

    const agentConstructionCount =
      (
        source.match(
          /new Agent/g
        ) ?? []
      ).length;

    expect(agentConstructionCount).toBe(1);
  });

  it("requires verified tool evidence before claiming business completion", () => {
    expect(implementationExists).toBe(true);

    if (!implementationExists) return;

    const source =
      readFileSync(
        implementationPath,
        "utf8"
      );

    expect(source).toContain(
      "VERIFIED"
    );

    expect(source).toContain(
      "Do not claim"
    );
  });
});
