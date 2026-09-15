import { tool } from "@openai/agents";

import {
  SUPPLIER_CREATE_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createSupplierCreateTool() {
  return tool<
    typeof SUPPLIER_CREATE_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...SUPPLIER_CREATE_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: SUPPLIER_CREATE_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
