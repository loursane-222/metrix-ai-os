import { buildTaskRoute, type TaskNavigationDescriptor } from "./task-navigation";
import { dispatchConversationNavigation, registerConversationNavigationHandler, resetConversationNavigationHandlerForTests } from "@/lib/conversation-extensions/conversation-navigation-runtime";
import type { ExecutiveNavigationCommandInput, ExecutiveNavigationCompletion } from "@/lib/conversation-extensions/executive-navigation-command";
export const registerTaskNavigationHandler = registerConversationNavigationHandler;
export function dispatchTaskNavigation(descriptor: TaskNavigationDescriptor): boolean { return dispatchConversationNavigation(buildTaskRoute(descriptor)); }
export function dispatchTaskNavigationCommand(input: Omit<ExecutiveNavigationCommandInput, "route">, navigate = true): Promise<ExecutiveNavigationCompletion> { return dispatchConversationNavigation({ ...input, route: buildTaskRoute({ kind: "task.create" }) }, { navigate }) as Promise<ExecutiveNavigationCompletion>; }
export const resetTaskNavigationHandlerForTests = resetConversationNavigationHandlerForTests;
