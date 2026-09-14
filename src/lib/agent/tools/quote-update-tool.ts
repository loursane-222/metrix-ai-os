import { tool } from "@openai/agents";

import {
  QUOTE_UPDATE_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createQuoteUpdateTool() {
  return tool<
    typeof QUOTE_UPDATE_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...QUOTE_UPDATE_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: QUOTE_UPDATE_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
