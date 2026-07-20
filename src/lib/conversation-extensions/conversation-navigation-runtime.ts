import { EXECUTIVE_NAVIGATION_COMMAND_EXPIRY_MS, type ExecutiveNavigationCommand, type ExecutiveNavigationCommandInput, type ExecutiveNavigationCompletion } from "./executive-navigation-command";

type ConversationNavigationHandler = (path: string) => void;
type ExecutiveNavigationHandler = (command: ExecutiveNavigationCommand) => void;
type Clock = () => number;
type Scheduler = (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
type CancelScheduler = (timer: ReturnType<typeof setTimeout>) => void;
let handler: ConversationNavigationHandler | null = null;
let executiveHandler: ExecutiveNavigationHandler | null = null;

export class ExecutiveNavigationCommandRuntime {
  private generation = 0; private current: ExecutiveNavigationCommand | null = null; private listeners = new Set<() => void>();
  private completions = new Map<string, (value: ExecutiveNavigationCompletion) => void>(); private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private readonly clock: Clock = Date.now,
    private readonly schedule: Scheduler = (callback, delay) => setTimeout(callback, delay),
    private readonly cancel: CancelScheduler = (timer) => clearTimeout(timer),
  ) {}
  publish(input: ExecutiveNavigationCommandInput): { command: ExecutiveNavigationCommand; completion: Promise<ExecutiveNavigationCompletion> } {
    if (this.current && !terminal(this.current.state)) this.finish(this.current.commandId, this.current.generation, "SUPERSEDED", [], "Yeni bir gezinme komutu bunun yerini aldı.");
    const now = this.clock(); const generation = ++this.generation; const { ttlMs, ...payload } = input;
    const command: ExecutiveNavigationCommand = Object.freeze({ ...payload, commandId: input.commandId ?? crypto.randomUUID(), createdAt: now, expiresAt: now + (ttlMs ?? EXECUTIVE_NAVIGATION_COMMAND_EXPIRY_MS), generation, state: "CREATED" });
    let resolve!: (value: ExecutiveNavigationCompletion) => void; const completion = new Promise<ExecutiveNavigationCompletion>((done) => { resolve = done; });
    this.completions.set(command.commandId, resolve); this.current = command; this.emit();
    this.expiryTimer = this.schedule(() => this.finish(command.commandId, generation, "EXPIRED", [], "Hedef ekran zamanında hazırlanamadı."), command.expiresAt - now);
    return { command, completion };
  }
  transition(commandId: string, generation: number, state: ExecutiveNavigationCommand["state"]): boolean {
    if (!this.isCurrent(commandId, generation) || !this.current || terminal(this.current.state) || this.clock() >= this.current.expiresAt) return false;
    if (!allowed(this.current.state, state)) return false;
    this.current = Object.freeze({ ...this.current, state }); this.emit(); return true;
  }
  acknowledgeRoute(commandId: string, generation: number, pathname: string): boolean {
    if (!this.isCurrent(commandId, generation) || this.current?.state !== "NAVIGATING") return false;
    if (normalizePathname(pathname) !== normalizePathname(this.current.route)) return false;
    return this.transition(commandId, generation, "WAITING_FOR_SURFACE");
  }
  finish(commandId: string, generation: number, state: ExecutiveNavigationCompletion["status"], changedExecutiveTargetIds: readonly string[], message?: string): boolean {
    if (!this.isCurrent(commandId, generation) || !this.current) return false;
    if (this.expiryTimer) this.cancel(this.expiryTimer); this.expiryTimer = null;
    this.current = Object.freeze({ ...this.current, state }); this.emit();
    this.completions.get(commandId)?.(Object.freeze({ status: state, changedExecutiveTargetIds: Object.freeze([...changedExecutiveTargetIds]), ...(message ? { message } : {}) }));
    this.completions.delete(commandId);
    queueMicrotask(() => { if (this.current?.commandId === commandId && this.current.generation === generation && terminal(this.current.state)) { this.current = null; this.emit(); } });
    return true;
  }
  isCurrent(commandId: string, generation: number): boolean { return this.current?.commandId === commandId && this.current.generation === generation; }
  getSnapshot = () => this.current; subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  resetForTests(): void { if (this.expiryTimer) this.cancel(this.expiryTimer); this.expiryTimer = null; this.current = null; this.generation = 0; this.completions.clear(); this.emit(); }
  private emit(): void { for (const listener of this.listeners) listener(); }
}
const terminal = (state: ExecutiveNavigationCommand["state"]) => ["COMPLETED", "FAILED", "EXPIRED", "SUPERSEDED"].includes(state);
function allowed(from: ExecutiveNavigationCommand["state"], to: ExecutiveNavigationCommand["state"]): boolean {
  if (from === "CREATED") return to === "NAVIGATING" || to === "WAITING_FOR_SURFACE";
  if (from === "NAVIGATING") return to === "WAITING_FOR_SURFACE";
  if (from === "WAITING_FOR_SURFACE") return to === "CLAIMED";
  if (from === "CLAIMED") return to === "APPLYING";
  return false;
}
export const executiveNavigationCommandRuntime = new ExecutiveNavigationCommandRuntime();
export function registerConversationNavigationHandler(next: ConversationNavigationHandler) { handler = next; return () => { if (handler === next) handler = null; }; }
export function registerExecutiveNavigationHandler(next: ExecutiveNavigationHandler) { executiveHandler = next; return () => { if (executiveHandler === next) executiveHandler = null; }; }
export function dispatchConversationNavigation(input: string): boolean;
export function dispatchConversationNavigation(input: ExecutiveNavigationCommandInput, options?: Readonly<{ navigate?: boolean }>): Promise<ExecutiveNavigationCompletion>;
export function dispatchConversationNavigation(input: string | ExecutiveNavigationCommandInput, options: Readonly<{ navigate?: boolean }> = {}): Promise<ExecutiveNavigationCompletion> | boolean {
  if (typeof input === "string") { if (!handler) return false; handler(input); return true; }
  const published = executiveNavigationCommandRuntime.publish(input);
  if (!isSafeNavigationRoute(input.route)) { executiveNavigationCommandRuntime.finish(published.command.commandId, published.command.generation, "FAILED", [], "Geçersiz gezinme hedefi."); return published.completion; }
  if (options.navigate !== false && !executiveHandler) { executiveNavigationCommandRuntime.finish(published.command.commandId, published.command.generation, "FAILED", [], "Gezinme işleyicisi hazır değil."); return published.completion; }
  if (options.navigate !== false) {
    executiveNavigationCommandRuntime.transition(published.command.commandId, published.command.generation, "NAVIGATING");
    try { executiveHandler!(published.command); }
    catch (cause: unknown) {
      const diagnostic = safeNavigationDiagnostic(cause);
      console.error("[ExecutiveNavigationCommandRuntime] navigation request failed", {
        stage: "route-request",
        ...diagnostic,
        commandId: published.command.commandId,
        generation: published.command.generation,
        requestedRoute: published.command.route,
      });
      executiveNavigationCommandRuntime.finish(published.command.commandId, published.command.generation, "FAILED", [], "Yeni müşteri ekranı şu anda açılamadı.");
    }
  }
  else executiveNavigationCommandRuntime.transition(published.command.commandId, published.command.generation, "WAITING_FOR_SURFACE");
  return published.completion;
}
export function resetConversationNavigationHandlerForTests() { handler = null; executiveHandler = null; executiveNavigationCommandRuntime.resetForTests(); }
export function normalizePathname(pathname: string): string { const withoutQuery = pathname.split(/[?#]/, 1)[0] || "/"; const normalized = withoutQuery.replace(/\/{2,}/g, "/").replace(/\/$/, ""); return normalized || "/"; }
export function isSafeNavigationRoute(route: string): boolean { const normalized = normalizePathname(route); return normalized === "/metrix" || normalized.startsWith("/metrix/"); }
function safeNavigationDiagnostic(cause: unknown): { errorName: string; errorMessage: string } {
  const errorName = cause instanceof Error && /^(?:Error|[A-Za-z][A-Za-z0-9]*Error)$/.test(cause.name) ? cause.name : "UnknownError";
  const rawMessage = cause instanceof Error ? cause.message.trim() : "";
  const errorMessage = /^(navigation|router|route)[ A-Za-z0-9:._/-]{0,140}$/i.test(rawMessage) ? rawMessage : "Navigation handler failure";
  return { errorName, errorMessage };
}
