import { tool } from "@openai/agents";

import {
  COLLECTION_LOOKUP_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createCollectionLookupTool() {
  return tool<
    typeof COLLECTION_LOOKUP_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...COLLECTION_LOOKUP_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: COLLECTION_LOOKUP_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
