"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

export type ExecutiveHeaderActions = Readonly<{
  openHistory: () => void;
  toggleSettings: () => void;
}>;

type RegisterExecutiveHeaderActions = (actions: ExecutiveHeaderActions) => () => void;

const ExecutiveHeaderActionsContext = createContext<RegisterExecutiveHeaderActions | null>(null);

export function ExecutiveHeaderActionsProvider({ children, register }: { children: ReactNode; register: RegisterExecutiveHeaderActions }) {
  return <ExecutiveHeaderActionsContext.Provider value={register}>{children}</ExecutiveHeaderActionsContext.Provider>;
}

/** Registers callbacks only; conversation-owned history/settings state remains in MetrixChatTab. */
export function useExecutiveHeaderActions(actions: ExecutiveHeaderActions): void {
  const register = useContext(ExecutiveHeaderActionsContext);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  useEffect(() => register?.({
    openHistory: () => actionsRef.current.openHistory(),
    toggleSettings: () => actionsRef.current.toggleSettings(),
  }), [register]);
}
