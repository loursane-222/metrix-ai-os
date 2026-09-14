import {
  readFileSync
} from "node:fs";

import {
  describe,
  expect,
  it
} from "vitest";

import {
  createMetrixExecutiveAgent
} from "../../src/lib/agent/metrix-executive-agent";

import {
  METRIX_RESPONSES_FUNCTION_TOOLS
} from "../../src/lib/agent/tools/metrix-business-tool-runtime";

describe(
  "Text and Live METRIX canonical backend parity",
  () => {
    it(
      "shares one executive instruction source",
      () => {
        const textAgentSource =
          readFileSync(
            "src/lib/agent/metrix-executive-agent.ts",
            "utf8"
          );

        const liveConfigSource =
          readFileSync(
            "src/lib/live/live-session-config.ts",
            "utf8"
          );

        expect(
          textAgentSource
        ).toContain(
          "buildMetrixExecutiveBackendInstructions"
        );

        expect(
          liveConfigSource
        ).toContain(
          "buildMetrixExecutiveBackendInstructions"
        );
      }
    );

    it(
      "publishes the same canonical business tool catalog",
      () => {
        const textToolNames =
          createMetrixExecutiveAgent()
            .tools
            .map(
              (tool) =>
                tool.name
            );

        const liveToolNames =
          METRIX_RESPONSES_FUNCTION_TOOLS
            .map(
              (tool) =>
                tool.name
            );

        expect(
          textToolNames
        ).toEqual(
          liveToolNames
        );
      }
    );

    it(
      "routes every text business wrapper through the canonical runtime",
      () => {
        const wrapperPaths = [
          "src/lib/agent/tools/task-create-tool.ts",
          "src/lib/agent/tools/task-list-tool.ts",
          "src/lib/agent/tools/task-update-tool.ts",
          "src/lib/agent/tools/customer-create-tool.ts",
          "src/lib/agent/tools/customer-lookup-tool.ts",
          "src/lib/agent/tools/product-service-lookup-tool.ts",
          "src/lib/agent/tools/quote-create-tool.ts",
          "src/lib/agent/tools/quote-lookup-tool.ts",
          "src/lib/agent/tools/quote-update-tool.ts",
          "src/lib/agent/tools/quote-mark-won-tool.ts",
          "src/lib/agent/tools/order-create-from-quote-tool.ts",
          "src/lib/agent/tools/order-lookup-tool.ts"
        ];

        for (
          const wrapperPath
          of wrapperPaths
        ) {
          const source =
            readFileSync(
              wrapperPath,
              "utf8"
            );

          expect(
            source
          ).toContain(
            "executeMetrixBusinessTool"
          );
        }
      }
    );

    it(
      "keeps the text route as transport only",
      () => {
        const routeSource =
          readFileSync(
            "src/app/api/metrix/route.ts",
            "utf8"
          );

        expect(
          routeSource
        ).toContain(
          "runMetrixExecutiveTurn"
        );

        expect(
          routeSource
        ).toContain(
          "resolveAuthenticatedExecutiveContext"
        );

        expect(
          routeSource
        ).not.toMatch(
          /executeMetrixBusinessTool|executeTaskCreate|executeCustomerCreate|executeCustomerLookup|classifyConversation|semanticRouter|conversationRouter|plannerRouter|intentClassifier|narrationLayer|responseNarrator/
        );
      }
    );
  }
);
