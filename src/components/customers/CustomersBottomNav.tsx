"use client";

// ExecutiveDock — the approved production asset, /public/design/executive-dock-transparent.png
// (see design-system/README.md "Executive Dock — Asset Kararı"), rendered as-is
// with real accessible navigation links overlaid on top. The raster is the
// visual shell; real HTML controls provide the actual navigation. The asset's
// baked-in active state ("Şirketim") is a static-image limitation — it does
// not visually react to the current route.
//
// The PNG carries a real alpha channel: fully transparent outside the pill,
// fully opaque on the pill/glow/shadow. That alone does the work, so it's
// rendered at its natural intrinsic size (width 100%, height auto) — no
// clip-path, mask, crop, or aspect-ratio override.
import Link from "next/link";

const DOCK_ITEMS = [
  { label: "Sirketim", href: "/metrix/company" },
  { label: "Gunluk Ritim", href: "/metrix/daily-rhythm" },
  { label: "Metrix", href: "/metrix" },
  { label: "Is Plani", href: "/metrix/work-plan" },
  { label: "Diger", href: "/metrix/customers" },
] as const;

export function CustomersBottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 px-[15px]"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
    >
      <div className="relative mx-auto max-w-[430px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className="block w-full h-auto select-none"
          draggable={false}
          src="/design/executive-dock-transparent.png"
        />
        <div className="absolute inset-0 flex">
          {DOCK_ITEMS.map((item) => (
            <Link
              aria-label={item.label}
              className="h-full flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#35DCE3]"
              href={item.href}
              key={item.href}
            />
          ))}
        </div>
      </div>
    </nav>
  );
}
