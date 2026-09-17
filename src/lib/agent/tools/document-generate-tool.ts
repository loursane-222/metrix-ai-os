import { tool } from "@openai/agents";

import {
  DOCUMENT_GENERATE_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createDocumentGenerateTool() {
  return tool<
    typeof DOCUMENT_GENERATE_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...DOCUMENT_GENERATE_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: DOCUMENT_GENERATE_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
