"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import { INITIAL_PRODUCT_EXPERIENCE_STATE, reduceProductExperience, type ProductExperienceState } from "@/lib/product-experience/product-experience";

type PresentationIdentity = Readonly<{ surfaceInstanceId: string }>;
type ProductExperienceApi = Readonly<{
  state: ProductExperienceState;
  openCustomerDetail(input: Readonly<{ customerId: string; commandId: string; correlationId: string; surfaceInstanceId?: string }>): string;
  openCustomerCreate(input: Readonly<{ fields: Readonly<Record<string, string>>; operationId: string; commandId: string; correlationId: string; surfaceInstanceId?: string }>): string;
  acknowledgeMounted(input: PresentationIdentity): void;
  acknowledgeVisibleReady(input: PresentationIdentity): void;
  failPresentation(input: PresentationIdentity & { reason: string }): void;
  returnToConversation(): void;
  reopenActiveSurface(): void;
  closeSurface(): void;
  isProductExperienceCommand(input: Readonly<{ route: string; expectedSurfaceAuthorityKey: string }>): boolean;
  claimProductExperienceCommand(input: Readonly<{ commandId: string; correlationId: string; route: string; expectedSurfaceAuthorityKey: string; fields?: Readonly<Record<string, string>>; operationId?: string }>): boolean;
}>;

const Context = createContext<ProductExperienceApi | null>(null);

export function ProductExperienceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduceProductExperience, INITIAL_PRODUCT_EXPERIENCE_STATE);
  const openCustomerDetail = useCallback((input: Parameters<ProductExperienceApi["openCustomerDetail"]>[0]) => {
    const surfaceInstanceId = input.surfaceInstanceId ?? crypto.randomUUID();
    dispatch({ type: "open-detail", ...input, surfaceInstanceId });
    return surfaceInstanceId;
  }, []);
  const openCustomerCreate = useCallback((input: Parameters<ProductExperienceApi["openCustomerCreate"]>[0]) => {
    const surfaceInstanceId = input.surfaceInstanceId ?? crypto.randomUUID();
    dispatch({ type: "open-create", ...input, surfaceInstanceId });
    return surfaceInstanceId;
  }, []);
  const api = useMemo<ProductExperienceApi>(() => ({
    state,
    openCustomerDetail,
    openCustomerCreate,
    acknowledgeMounted: ({ surfaceInstanceId }) => dispatch({ type: "mounted", surfaceInstanceId }),
    acknowledgeVisibleReady: ({ surfaceInstanceId }) => dispatch({ type: "visible-ready", surfaceInstanceId }),
    failPresentation: ({ surfaceInstanceId }) => dispatch({ type: "failed", surfaceInstanceId }),
    returnToConversation: () => dispatch({ type: "return" }),
    reopenActiveSurface: () => dispatch({ type: "reopen" }),
    closeSurface: () => dispatch({ type: "close" }),
    isProductExperienceCommand: ({ route, expectedSurfaceAuthorityKey }) => {
      if (route === "/metrix/customers/new") return expectedSurfaceAuthorityKey === "customers.customer.create";
      return expectedSurfaceAuthorityKey === "customers.detail.page" && /^\/metrix\/customers\/[^/]+\/?$/u.test(route);
    },
    claimProductExperienceCommand: (input) => {
      if (input.route === "/metrix/customers/new" && input.expectedSurfaceAuthorityKey === "customers.customer.create") {
        openCustomerCreate({ fields: input.fields ?? {}, operationId: input.operationId ?? input.correlationId, commandId: input.commandId, correlationId: input.correlationId });
        return true;
      }
      const match = input.route.match(/^\/metrix\/customers\/([^/]+)\/?$/u);
      if (match && input.expectedSurfaceAuthorityKey === "customers.detail.page") {
        openCustomerDetail({ customerId: decodeURIComponent(match[1]), commandId: input.commandId, correlationId: input.correlationId });
        return true;
      }
      return false;
    },
  }), [openCustomerCreate, openCustomerDetail, state]);
  return <Context.Provider value={api}>{children}</Context.Provider>;
}

export function useProductExperience(): ProductExperienceApi {
  const value = useContext(Context);
  if (!value) throw new Error("ProductExperienceProvider is not mounted.");
  return value;
}

