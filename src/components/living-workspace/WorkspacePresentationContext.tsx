"use client";

import { createContext, useContext } from "react";

const WorkspacePresentationContext = createContext(false);

export const WorkspacePresentationProvider = WorkspacePresentationContext.Provider;

export function useWorkspacePresentation(): boolean {
  return useContext(WorkspacePresentationContext);
}
