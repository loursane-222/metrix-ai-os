"use client";

import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from "react";
import { UniversalInputAuthorityHost, universalInputRegistry, type UniversalInputDiscoverySnapshot } from "@/lib/input-authority";

const HostContext = createContext<UniversalInputAuthorityHost | null>(null);
const empty = Object.freeze([]);
const serverSnapshot: UniversalInputDiscoverySnapshot = Object.freeze({ snapshotId: 0, generatedAt: "", activePage: null, activeSurfaces: empty, surfaces: Object.freeze({ activePage: null, activeWorkspace: null, activeSurfacePath: empty, visibleSurfaces: empty, activeSurfaces: empty, openDialogs: empty, openDrawers: empty, activeTabs: empty, activeTabPanels: empty, expandedSections: empty, activeWizard: null, activeWizardStep: null, modalStack: empty, topInteractionSurface: null, focusScope: null, surfaceCount: 0, visibleSurfaceCount: 0, activeSurfaceCount: 0 }), sections: empty, fields: empty, selections: empty, attachments: empty, actions: empty, validation: Object.freeze({ valid: 0, invalid: 0, missing: 0, unknown: 0 }), writableTargetCount: 0, invalidTargetCount: 0, requiredMissingTargetCount: 0 });

export function UniversalInputAuthorityProvider({ children }: { children: ReactNode }) { const host = useMemo(() => new UniversalInputAuthorityHost(universalInputRegistry), []); return <HostContext.Provider value={host}>{children}</HostContext.Provider>; }
export function useUniversalInputAuthorityHost() { const host = useContext(HostContext); if (!host) throw new Error("UniversalInputAuthorityProvider is not mounted."); return host; }
export function useUniversalInputDiscovery() { return useSyncExternalStore(universalInputRegistry.subscribe, universalInputRegistry.getSnapshot, () => serverSnapshot); }
