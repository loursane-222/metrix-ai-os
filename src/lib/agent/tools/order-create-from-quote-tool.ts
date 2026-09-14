import { tool } from "@openai/agents";

import {
  ORDER_CREATE_FROM_QUOTE_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createOrderCreateFromQuoteTool() {
  return tool<
    typeof ORDER_CREATE_FROM_QUOTE_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...ORDER_CREATE_FROM_QUOTE_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: ORDER_CREATE_FROM_QUOTE_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
