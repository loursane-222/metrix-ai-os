import { tool } from "@openai/agents";

import {
  LOCATION_CREATE_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";

import type { ExecutiveToolContext } from "../types";

export function createLocationCreateTool() {
  return tool<
    typeof LOCATION_CREATE_BUSINESS_TOOL.parameters,
    ExecutiveToolContext
  >({
    ...LOCATION_CREATE_BUSINESS_TOOL,
    async execute(args, runContext) {
      return executeMetrixBusinessTool({
        name: LOCATION_CREATE_BUSINESS_TOOL.name,
        argumentsJson: JSON.stringify(args),
        context: metrixTrustedToolContextForExecutiveTurn(
          runContext?.context
        )
      });
    }
  });
}
