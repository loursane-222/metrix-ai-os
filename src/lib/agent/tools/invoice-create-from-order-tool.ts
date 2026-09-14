import { tool } from "@openai/agents";

import {
  INVOICE_CREATE_FROM_ORDER_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createInvoiceCreateFromOrderTool() {
  return tool<
    typeof INVOICE_CREATE_FROM_ORDER_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...INVOICE_CREATE_FROM_ORDER_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: INVOICE_CREATE_FROM_ORDER_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
