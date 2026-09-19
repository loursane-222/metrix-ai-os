import { tool } from "@openai/agents";

import {
  CUSTOMER_UPDATE_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createCustomerUpdateTool() {
  return tool<
    typeof CUSTOMER_UPDATE_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...CUSTOMER_UPDATE_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: CUSTOMER_UPDATE_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
