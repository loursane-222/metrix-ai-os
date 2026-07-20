import { ExecutivePresenceRuntimeProvider } from "@/components/executive-presence";
import { ExecutiveNavigationCommandHost, UniversalInputAuthorityProvider } from "@/components/input-authority";

export default function MetrixLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <UniversalInputAuthorityProvider>
      <ExecutiveNavigationCommandHost />
      <ExecutivePresenceRuntimeProvider>{children}</ExecutivePresenceRuntimeProvider>
    </UniversalInputAuthorityProvider>
  );
}
