"use client";

import { useEffect } from "react";
import { universalInputRegistry, type UniversalInputTargetDescriptor, type UniversalInputTargetRuntimeAdapter } from "@/lib/input-authority";

export type UniversalRegistrationInput = Readonly<{ descriptor: UniversalInputTargetDescriptor; adapter: UniversalInputTargetRuntimeAdapter }>;
export function useUniversalInputRegistrations(inputs: readonly UniversalRegistrationInput[]) {
  useEffect(() => { const registrations = inputs.map((input) => universalInputRegistry.register(input)); return () => { for (const registration of registrations) universalInputRegistry.unregister(registration.descriptor.executiveTargetId, registration.registrationToken); }; }, [inputs]);
}
