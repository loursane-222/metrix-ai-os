import { tool } from "@openai/agents";

import {
  SUPPLIER_LOOKUP_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createSupplierLookupTool() {
  return tool<
    typeof SUPPLIER_LOOKUP_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...SUPPLIER_LOOKUP_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: SUPPLIER_LOOKUP_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
