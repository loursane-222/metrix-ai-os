import { tool } from "@openai/agents";

import {
  SALES_SUMMARY_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createSalesSummaryTool() {
  return tool<
    typeof SALES_SUMMARY_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...SALES_SUMMARY_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: SALES_SUMMARY_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
