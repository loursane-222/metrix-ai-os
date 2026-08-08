import { ExecutivePresenceRuntimeProvider } from "@/components/executive-presence";
import { ExecutiveNavigationCommandHost, UniversalInputAuthorityProvider } from "@/components/input-authority";
import { ExecutiveAppShell } from "@/components/living-workspace/ExecutiveAppShell";

export default function MetrixLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <UniversalInputAuthorityProvider>
      <ExecutiveNavigationCommandHost />
      <ExecutivePresenceRuntimeProvider>
        <ExecutiveAppShell>{children}</ExecutiveAppShell>
      </ExecutivePresenceRuntimeProvider>
    </UniversalInputAuthorityProvider>
  );
}
