import { tool } from "@openai/agents";

import {
  MAIL_SEARCH_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createMailSearchTool() {
  return tool<
    typeof MAIL_SEARCH_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...MAIL_SEARCH_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: MAIL_SEARCH_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
