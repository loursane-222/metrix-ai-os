import { tool } from "@openai/agents";

import {
  QUOTE_MARK_WON_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createQuoteMarkWonTool() {
  return tool<
    typeof QUOTE_MARK_WON_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...QUOTE_MARK_WON_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: QUOTE_MARK_WON_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
