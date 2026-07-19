import { buildCustomerRoute, type CustomerNavigationDescriptor } from "./customer-navigation";
import { dispatchConversationNavigation, registerConversationNavigationHandler, resetConversationNavigationHandlerForTests } from "@/lib/conversation-extensions/conversation-navigation-runtime";
export const registerCustomerNavigationHandler = registerConversationNavigationHandler;
export function dispatchCustomerNavigation(descriptor: CustomerNavigationDescriptor): boolean { return dispatchConversationNavigation(buildCustomerRoute(descriptor)); }
export const resetCustomerNavigationHandlerForTests = resetConversationNavigationHandlerForTests;
