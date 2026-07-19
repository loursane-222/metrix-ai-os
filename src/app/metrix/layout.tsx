import { ExecutivePresenceRuntimeProvider } from "@/components/executive-presence";
import { UniversalInputAuthorityProvider } from "@/components/input-authority";

export default function MetrixLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <UniversalInputAuthorityProvider>
      <ExecutivePresenceRuntimeProvider>{children}</ExecutivePresenceRuntimeProvider>
    </UniversalInputAuthorityProvider>
  );
}
