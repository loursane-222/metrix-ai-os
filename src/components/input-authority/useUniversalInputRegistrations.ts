"use client";

import { useEffect, useRef } from "react";
import { universalInputRegistry, type UniversalInputRegistration, type UniversalInputTargetDescriptor, type UniversalInputTargetRuntimeAdapter } from "@/lib/input-authority";

export type UniversalRegistrationInput = Readonly<{ descriptor: UniversalInputTargetDescriptor; adapter: UniversalInputTargetRuntimeAdapter }>;
export function useUniversalInputRegistrations(inputs: readonly UniversalRegistrationInput[]) {
  const owned = useRef(new Map<string, UniversalInputRegistration>());
  useEffect(() => {
    const nextIds = new Set(inputs.map((input) => input.descriptor.executiveTargetId));
    for (const [targetId, registration] of owned.current) if (!nextIds.has(targetId)) { universalInputRegistry.unregister(targetId, registration.registrationToken); owned.current.delete(targetId); }
    for (const input of inputs) {
      const targetId = input.descriptor.executiveTargetId; const current = owned.current.get(targetId);
      if (!current || universalInputRegistry.getByTargetId(targetId)?.registrationToken !== current.registrationToken) { owned.current.set(targetId, universalInputRegistry.register(input)); continue; }
      let updated = current;
      if (!equalDescriptor(current.descriptor, input.descriptor)) updated = universalInputRegistry.updateDescriptor(targetId, current.registrationToken, input.descriptor) ?? updated;
      if (!equalAdapter(updated.adapter, input.adapter)) updated = universalInputRegistry.updateAdapter(targetId, updated.registrationToken, input.adapter) ?? updated;
      owned.current.set(targetId, updated);
    }
  }, [inputs]);
  useEffect(() => () => { for (const registration of owned.current.values()) universalInputRegistry.unregister(registration.descriptor.executiveTargetId, registration.registrationToken); owned.current.clear(); }, []);
}
function equalDescriptor(a: UniversalInputTargetDescriptor, b: UniversalInputTargetDescriptor) { return JSON.stringify(a) === JSON.stringify(b); }
function equalAdapter(a: UniversalInputTargetRuntimeAdapter, b: UniversalInputTargetRuntimeAdapter) { const keys = new Set([...Object.keys(a), ...Object.keys(b)] as Array<keyof UniversalInputTargetRuntimeAdapter>); return [...keys].every((key) => a[key] === b[key]); }
