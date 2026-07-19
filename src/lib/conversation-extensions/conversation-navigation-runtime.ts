type ConversationNavigationHandler = (path: string) => void;
let handler: ConversationNavigationHandler | null = null;
export function registerConversationNavigationHandler(next: ConversationNavigationHandler) { handler = next; return () => { if (handler === next) handler = null; }; }
export function dispatchConversationNavigation(path: string): boolean { if (!handler) return false; handler(path); return true; }
export function resetConversationNavigationHandlerForTests() { handler = null; }
