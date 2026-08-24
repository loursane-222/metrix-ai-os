"use client";

import { createContext, useContext } from "react";

const DomainWorkspaceCloseContext = createContext<() => void>(() => undefined);

export const DomainWorkspaceCloseProvider = DomainWorkspaceCloseContext.Provider;
export function useDomainWorkspaceClose() { return useContext(DomainWorkspaceCloseContext); }
