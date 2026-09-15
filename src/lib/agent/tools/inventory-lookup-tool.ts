import { tool } from "@openai/agents";

import {
  INVENTORY_LOOKUP_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createInventoryLookupTool() {
  return tool<
    typeof INVENTORY_LOOKUP_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...INVENTORY_LOOKUP_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: INVENTORY_LOOKUP_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
