import { tool } from "@openai/agents";

import {
  INTEGRATION_STATUS_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createIntegrationStatusTool() {
  return tool<
    typeof INTEGRATION_STATUS_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...INTEGRATION_STATUS_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: INTEGRATION_STATUS_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
