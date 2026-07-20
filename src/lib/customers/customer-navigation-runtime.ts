import { buildCustomerRoute, type CustomerNavigationDescriptor } from "./customer-navigation";
import { dispatchConversationNavigation, registerConversationNavigationHandler, resetConversationNavigationHandlerForTests } from "@/lib/conversation-extensions/conversation-navigation-runtime";
import type { ExecutiveNavigationCommandInput, ExecutiveNavigationCompletion } from "@/lib/conversation-extensions/executive-navigation-command";
export const registerCustomerNavigationHandler = registerConversationNavigationHandler;
export function dispatchCustomerNavigation(descriptor: CustomerNavigationDescriptor): boolean { return dispatchConversationNavigation(buildCustomerRoute(descriptor)); }
export function dispatchCustomerNavigationCommand(input: Omit<ExecutiveNavigationCommandInput, "route">, navigate = true): Promise<ExecutiveNavigationCompletion> { return dispatchConversationNavigation({ ...input, route: buildCustomerRoute({ kind: "customer.create" }) }, { navigate }) as Promise<ExecutiveNavigationCompletion>; }
export const resetCustomerNavigationHandlerForTests = resetConversationNavigationHandlerForTests;
