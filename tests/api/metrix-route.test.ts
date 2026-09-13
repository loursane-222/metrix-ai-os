import {
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

const routePath = join(
  process.cwd(),
  "src/app/api/metrix/route.ts"
);

const source =
  readFileSync(
    routePath,
    "utf8"
  );

describe("/api/metrix executive entrypoint", () => {
  it("removes the EXECUTIVE_NOT_WIRED placeholder", () => {
    expect(source).not.toContain(
      "EXECUTIVE_NOT_WIRED"
    );
  });

  it("delegates directly to the single Executive Agent", () => {
    expect(source).toContain(
      "runMetrixExecutiveTurn"
    );

    expect(source).toContain(
      'from "../../../lib/agent/metrix-executive-agent"'
    );
  });

  it("validates only transport fields", () => {
    expect(source).toContain(
      "message"
    );

    expect(source).toContain(
      "actorUserId"
    );

    expect(source).toContain(
      "organizationId"
    );

    expect(source).toContain(
      "turnId"
    );
  });

  it("contains no semantic classifier, router, planner, narrator, or business mutation", () => {
    expect(source).not.toMatch(
      /classifyConversation|semanticRouter|conversationRouter|plannerRouter|intentClassifier|narrationLayer|responseNarrator|executeTaskCreate|db\.task|actionExecution/
    );
  });
});
