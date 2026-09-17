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
      "shares one executive instruction source — voice runs the exact same backend Executive as text, not a second persona/instruction set",
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

        const delegationBridgeSource =
          readFileSync(
            "src/lib/live/live-delegation-bridge.ts",
            "utf8"
          );

        expect(
          textAgentSource
        ).toContain(
          "buildMetrixExecutiveBackendInstructions"
        );

        // Under client delegation, the Live session itself never carries
        // a Responses-model instruction set at all (there is no
        // server-owned Responses conversation any more) — the single
        // instruction source lives only in metrix-executive-agent.ts /
        // metrix-executive-contract.ts, reached identically by both
        // surfaces via runMetrixExecutiveTurn. A second copy here would
        // be a second, divergence-prone persona source.
        expect(
          liveConfigSource
        ).not.toContain(
          "buildMetrixExecutiveBackendInstructions"
        );

        expect(
          delegationBridgeSource
        ).toContain(
          "runMetrixExecutiveTurn"
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

        // Not just coincidentally equal: the Live delegation bridge must
        // hold no import of the canonical tool runtime/contracts at all —
        // it runs createMetrixExecutiveAgent()'s own tool set via
        // runMetrixExecutiveTurn, so there is no second list that could
        // ever drift from the one above.
        const delegationBridgeSource =
          readFileSync(
            "src/lib/live/live-delegation-bridge.ts",
            "utf8"
          );

        expect(
          delegationBridgeSource
        ).not.toMatch(
          /metrix-business-tool-runtime/
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
          "src/lib/agent/tools/order-lookup-tool.ts",
          "src/lib/agent/tools/invoice-create-from-order-tool.ts",
          "src/lib/agent/tools/invoice-lookup-tool.ts",
          "src/lib/agent/tools/invoice-receivable-lookup-tool.ts",
          "src/lib/agent/tools/collection-record-tool.ts",
          "src/lib/agent/tools/collection-lookup-tool.ts",
          "src/lib/agent/tools/location-create-tool.ts",
          "src/lib/agent/tools/location-lookup-tool.ts",
          "src/lib/agent/tools/supplier-create-tool.ts",
          "src/lib/agent/tools/supplier-lookup-tool.ts",
          "src/lib/agent/tools/purchase-record-tool.ts",
          "src/lib/agent/tools/inventory-transfer-tool.ts",
          "src/lib/agent/tools/transformation-record-tool.ts",
          "src/lib/agent/tools/inventory-lookup-tool.ts"
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
