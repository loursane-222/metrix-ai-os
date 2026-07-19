"use client";

import { createContext, type ReactNode, useContext, useMemo, useSyncExternalStore } from "react";
import { UniversalInputAuthorityHost, universalInputRegistry, type UniversalInputDiscoverySnapshot } from "@/lib/input-authority";

const HostContext = createContext<UniversalInputAuthorityHost | null>(null);
const serverSnapshot: UniversalInputDiscoverySnapshot = Object.freeze({ snapshotId: 0, generatedAt: "", activePage: null, activeSurfaces: Object.freeze([]), sections: Object.freeze([]), fields: Object.freeze([]), selections: Object.freeze([]), attachments: Object.freeze([]), actions: Object.freeze([]), validation: Object.freeze({ valid: 0, invalid: 0, missing: 0, unknown: 0 }), writableTargetCount: 0, invalidTargetCount: 0, requiredMissingTargetCount: 0 });

export function UniversalInputAuthorityProvider({ children }: { children: ReactNode }) { const host = useMemo(() => new UniversalInputAuthorityHost(universalInputRegistry), []); return <HostContext.Provider value={host}>{children}</HostContext.Provider>; }
export function useUniversalInputAuthorityHost() { const host = useContext(HostContext); if (!host) throw new Error("UniversalInputAuthorityProvider is not mounted."); return host; }
export function useUniversalInputDiscovery() { return useSyncExternalStore(universalInputRegistry.subscribe, universalInputRegistry.getSnapshot, () => serverSnapshot); }
