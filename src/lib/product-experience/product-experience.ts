import type { ExecutiveNavigationCommand } from "@/lib/conversation-extensions/executive-navigation-command";

export type ProductExperienceSurface = "customer.detail" | "customer.create";

export type ProductExperienceState = Readonly<{
  mode: "conversation" | "surface";
  activeSurface: ProductExperienceSurface | null;
  activeEntityId: string | null;
  activeCapability: "customer" | null;
  surfacePayload: null | Readonly<{ fields?: Readonly<Record<string, string>>; operationId?: string }>;
  presentationStatus: "idle" | "opening" | "mounted" | "visible-ready" | "failed";
  activeCommand: null | Readonly<{
    commandId: string;
    correlationId: string;
    consumer: "product-experience";
    surfaceInstanceId: string;
  }>;
}>;

export const INITIAL_PRODUCT_EXPERIENCE_STATE: ProductExperienceState = Object.freeze({
  mode: "conversation",
  activeSurface: null,
  activeEntityId: null,
  activeCapability: null,
  surfacePayload: null,
  presentationStatus: "idle",
  activeCommand: null,
});

export type ProductExperienceAction =
  | Readonly<{ type: "open-detail"; customerId: string; commandId: string; correlationId: string; surfaceInstanceId: string }>
  | Readonly<{ type: "open-create"; fields: Readonly<Record<string, string>>; operationId: string; commandId: string; correlationId: string; surfaceInstanceId: string }>
  | Readonly<{ type: "mounted" | "visible-ready" | "failed"; surfaceInstanceId: string }>
  | Readonly<{ type: "return" | "reopen" | "close" }>;

export function reduceProductExperience(state: ProductExperienceState, action: ProductExperienceAction): ProductExperienceState {
  if (action.type === "open-detail") return Object.freeze({ mode: "surface", activeSurface: "customer.detail", activeEntityId: action.customerId, activeCapability: "customer", surfacePayload: null, presentationStatus: "opening", activeCommand: command(action) });
  if (action.type === "open-create") return Object.freeze({ mode: "surface", activeSurface: "customer.create", activeEntityId: null, activeCapability: "customer", surfacePayload: Object.freeze({ fields: Object.freeze({ ...action.fields }), operationId: action.operationId }), presentationStatus: "opening", activeCommand: command(action) });
  if (action.type === "return") return Object.freeze({ ...state, mode: "conversation" });
  if (action.type === "reopen") return state.activeSurface ? Object.freeze({ ...state, mode: "surface" }) : state;
  if (action.type === "close") return INITIAL_PRODUCT_EXPERIENCE_STATE;
  if (!("surfaceInstanceId" in action)) return state;
  if (!state.activeCommand || state.activeCommand.surfaceInstanceId !== action.surfaceInstanceId) return state;
  if (action.type === "mounted") return Object.freeze({ ...state, presentationStatus: "mounted" });
  if (action.type === "visible-ready") return Object.freeze({ ...state, presentationStatus: "visible-ready" });
  return Object.freeze({ ...state, presentationStatus: "failed", mode: "conversation" });
}

function command(action: Extract<ProductExperienceAction, { commandId: string }>) {
  return Object.freeze({ commandId: action.commandId, correlationId: action.correlationId, consumer: "product-experience" as const, surfaceInstanceId: action.surfaceInstanceId });
}

export function resolveProductExperienceTarget(command: Pick<ExecutiveNavigationCommand, "route" | "expectedSurfaceAuthorityKey">): null | { surface: ProductExperienceSurface; customerId?: string } {
  const path = command.route.split(/[?#]/, 1)[0].replace(/\/$/u, "");
  if (path === "/metrix/customers/new" && command.expectedSurfaceAuthorityKey === "customers.customer.create") return { surface: "customer.create" };
  const match = path.match(/^\/metrix\/customers\/([^/]+)$/u);
  if (match && command.expectedSurfaceAuthorityKey === "customers.detail.page") return { surface: "customer.detail", customerId: decodeURIComponent(match[1]) };
  return null;
}

export function projectionFromCommand(command: Pick<ExecutiveNavigationCommand, "batch">): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  for (const item of command.batch ?? []) {
    if (item.type !== "SET" || !item.executiveTargetId) continue;
    const prefix = "field.customers.create.customer.";
    if (!item.executiveTargetId.startsWith(prefix) || typeof item.value !== "string") continue;
    fields[item.executiveTargetId.slice(prefix.length)] = item.value;
  }
  return Object.freeze(fields);
}
