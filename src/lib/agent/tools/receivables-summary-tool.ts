import { tool } from "@openai/agents";

import {
  RECEIVABLES_SUMMARY_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createReceivablesSummaryTool() {
  return tool<
    typeof RECEIVABLES_SUMMARY_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...RECEIVABLES_SUMMARY_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: RECEIVABLES_SUMMARY_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
