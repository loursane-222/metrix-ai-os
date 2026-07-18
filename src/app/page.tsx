import { ExecutivePresenceRuntimeProvider } from "@/components/executive-presence";
import { MetrixOnboardingApp } from "./metrix-onboarding-app";

export default function Home() {
  return (
    <ExecutivePresenceRuntimeProvider>
      <MetrixOnboardingApp />
    </ExecutivePresenceRuntimeProvider>
  );
}
