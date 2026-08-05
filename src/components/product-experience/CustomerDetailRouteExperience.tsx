"use client";

import { useEffect, useState } from "react";
import { CustomerDetailScreen } from "@/components/customers/CustomerDetailScreen";
import { WorkspacePresentationProvider } from "@/components/living-workspace/WorkspacePresentationContext";
import { MetrixTabScreen } from "@/components/metrix-tab/MetrixTabScreen";

export function CustomerDetailRouteExperience({ customerId }: { customerId: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return <div className="relative h-full min-h-0 overflow-hidden">
    <section className="absolute inset-x-0 top-0 z-40 h-[124px] min-h-0 overflow-hidden">
      <WorkspacePresentationProvider value={true}><MetrixTabScreen /></WorkspacePresentationProvider>
    </section>
    <section className={`absolute inset-0 z-30 min-h-0 overflow-y-auto bg-[#071018] pt-[124px] transition-[opacity,transform] duration-[380ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none ${visible ? "scale-100 opacity-100" : "scale-[.975] opacity-0"}`}>
      <CustomerDetailScreen customerId={customerId} presentation="embedded" />
    </section>
  </div>;
}
