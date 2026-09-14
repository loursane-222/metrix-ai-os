import { tool } from "@openai/agents";

import {
  PRODUCT_SERVICE_LOOKUP_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createProductServiceLookupTool() {
  return tool<
    typeof PRODUCT_SERVICE_LOOKUP_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...PRODUCT_SERVICE_LOOKUP_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: PRODUCT_SERVICE_LOOKUP_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
