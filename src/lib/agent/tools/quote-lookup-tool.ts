import { tool } from "@openai/agents";

import {
  QUOTE_LOOKUP_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createQuoteLookupTool() {
  return tool<
    typeof QUOTE_LOOKUP_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...QUOTE_LOOKUP_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: QUOTE_LOOKUP_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
