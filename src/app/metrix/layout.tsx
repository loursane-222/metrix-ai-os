import { ExecutivePresenceRuntimeProvider } from "@/components/executive-presence";
import { ExecutiveNavigationCommandHost, UniversalInputAuthorityProvider } from "@/components/input-authority";
import { ExecutiveAppShell } from "@/components/living-workspace/ExecutiveAppShell";
import { ProductExperienceProvider } from "@/components/product-experience/ProductExperienceProvider";

export default function MetrixLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <UniversalInputAuthorityProvider>
      <ProductExperienceProvider>
        <ExecutiveNavigationCommandHost />
        <ExecutivePresenceRuntimeProvider>
          <ExecutiveAppShell>{children}</ExecutiveAppShell>
        </ExecutivePresenceRuntimeProvider>
      </ProductExperienceProvider>
    </UniversalInputAuthorityProvider>
  );
}
