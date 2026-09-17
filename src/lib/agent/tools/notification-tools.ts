import { tool } from "@openai/agents";
import {
  NOTIFICATION_CREATE_BUSINESS_TOOL,
  NOTIFICATION_LIST_BUSINESS_TOOL,
  NOTIFICATION_MARK_READ_BUSINESS_TOOL,
  executeMetrixBusinessTool,
  metrixTrustedToolContextForExecutiveTurn
} from "./metrix-business-tool-runtime";
import type { ExecutiveToolContext } from "../types";

function execute(name: "notification_create" | "notification_mark_read" | "notification_list", args: unknown, context: ExecutiveToolContext | undefined) {
  return executeMetrixBusinessTool({ name, argumentsJson: JSON.stringify(args), context: metrixTrustedToolContextForExecutiveTurn(context) });
}

export function createNotificationTools() {
  return [
    tool<typeof NOTIFICATION_CREATE_BUSINESS_TOOL.parameters, ExecutiveToolContext>({ ...NOTIFICATION_CREATE_BUSINESS_TOOL, execute: (args, ctx) => execute("notification_create", args, ctx?.context) }),
    tool<typeof NOTIFICATION_MARK_READ_BUSINESS_TOOL.parameters, ExecutiveToolContext>({ ...NOTIFICATION_MARK_READ_BUSINESS_TOOL, execute: (args, ctx) => execute("notification_mark_read", args, ctx?.context) }),
    tool<typeof NOTIFICATION_LIST_BUSINESS_TOOL.parameters, ExecutiveToolContext>({ ...NOTIFICATION_LIST_BUSINESS_TOOL, execute: (args, ctx) => execute("notification_list", args, ctx?.context) })
  ];
}
