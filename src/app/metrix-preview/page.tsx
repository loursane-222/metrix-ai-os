import { ExecutivePresenceRuntimeProvider } from "@/components/executive-presence";
import { MetrixTabScreen } from "@/components/metrix-tab/MetrixTabScreen";

export default function MetrixPreviewPage() {
  return (
    <ExecutivePresenceRuntimeProvider>
      <div className="h-[100dvh] overflow-hidden bg-[#faf7f2]">
        <MetrixTabScreen />
      </div>
    </ExecutivePresenceRuntimeProvider>
  );
}
