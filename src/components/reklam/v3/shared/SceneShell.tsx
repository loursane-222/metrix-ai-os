"use client";

interface Props {
  sceneNumber: string;
  label: string;
  bg: string;
  children: React.ReactNode;
  showDebug?: boolean; // varsayılan false — üretimde görünmez
}

export function SceneShell({ sceneNumber, label, bg, children, showDebug = false }: Props) {
  return (
    <div
      className="relative w-full h-full flex flex-col overflow-hidden"
      style={{ background: bg }}
    >
      {showDebug && (
        <div className="absolute top-4 left-4 z-50 flex items-center gap-2 pointer-events-none select-none">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.35)" }}
          >
            {sceneNumber}
          </div>
          <span
            className="text-[9px] font-medium tracking-[0.2em] uppercase"
            style={{ color: "rgba(255,255,255,0.2)" }}
          >
            {label}
          </span>
        </div>
      )}

      {children}
    </div>
  );
}
