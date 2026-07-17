import { ExecutivePresenceRuntimeProvider } from "@/components/executive-presence";

export default function MetrixLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ExecutivePresenceRuntimeProvider>
      {children}
    </ExecutivePresenceRuntimeProvider>
  );
}
