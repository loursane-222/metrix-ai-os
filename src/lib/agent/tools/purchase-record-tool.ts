import { tool } from "@openai/agents";

import {
  PURCHASE_RECORD_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createPurchaseRecordTool() {
  return tool<
    typeof PURCHASE_RECORD_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...PURCHASE_RECORD_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: PURCHASE_RECORD_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
