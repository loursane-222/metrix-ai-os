import { tool } from "@openai/agents";

import {
  INVOICE_LOOKUP_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createInvoiceLookupTool() {
  return tool<
    typeof INVOICE_LOOKUP_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...INVOICE_LOOKUP_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: INVOICE_LOOKUP_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
