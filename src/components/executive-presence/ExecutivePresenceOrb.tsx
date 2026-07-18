"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useExecutivePresence } from "./ExecutivePresenceContext";
import {
  clampOrbPosition,
  EXECUTIVE_ORB_POSITION_STORAGE_KEY,
  exceedsDragThreshold,
  parseStoredOrbPosition,
  serializeOrbPosition,
  type OrbBounds,
  type OrbPosition,
} from "./executive-orb-position";

type PointerInteraction = {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  orbPosition: OrbPosition;
  dragging: boolean;
};

function readSafeAreaInsets(): { top: number; left: number; right: number; bottom: number } {
  const probe = document.createElement("div");
  probe.style.cssText = [
    "position:fixed",
    "visibility:hidden",
    "pointer-events:none",
    "padding-top:env(safe-area-inset-top, 0px)",
    "padding-right:env(safe-area-inset-right, 0px)",
    "padding-bottom:env(safe-area-inset-bottom, 0px)",
    "padding-left:env(safe-area-inset-left, 0px)",
  ].join(";");
  document.body.appendChild(probe);
  const style = window.getComputedStyle(probe);
  const insets = {
    top: Number.parseFloat(style.paddingTop) || 0,
    right: Number.parseFloat(style.paddingRight) || 0,
    bottom: Number.parseFloat(style.paddingBottom) || 0,
    left: Number.parseFloat(style.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

export function ExecutivePresenceOrb() {
  const { behaviorSnapshot, openPanel } = useExecutivePresence();
  const orbRef = useRef<HTMLButtonElement>(null);
  const positionRef = useRef<OrbPosition | null>(null);
  const interactionRef = useRef<PointerInteraction | null>(null);
  const suppressClickRef = useRef(false);
  const safeAreaRef = useRef<ReturnType<typeof readSafeAreaInsets> | null>(null);
  const [position, setPosition] = useState<OrbPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const getBounds = useCallback((): OrbBounds | null => {
    const orb = orbRef.current;
    if (orb === null) return null;
    const rect = orb.getBoundingClientRect();
    const safeArea = safeAreaRef.current ?? readSafeAreaInsets();
    safeAreaRef.current = safeArea;
    const mobile = window.matchMedia("(max-width: 767px)").matches;

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      orbWidth: rect.width || 64,
      orbHeight: rect.height || 64,
      horizontalInset: Math.max(16, safeArea.left, safeArea.right),
      topInset: Math.max(16, safeArea.top),
      bottomInset: mobile ? 104 + safeArea.bottom : Math.max(16, safeArea.bottom),
    };
  }, []);

  const updatePosition = useCallback((nextPosition: OrbPosition) => {
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }, []);

  const persistPosition = useCallback((nextPosition: OrbPosition) => {
    try {
      window.localStorage.setItem(
        EXECUTIVE_ORB_POSITION_STORAGE_KEY,
        serializeOrbPosition(nextPosition),
      );
    } catch {
      // Storage can be unavailable in restricted/private browser contexts.
    }
  }, []);

  useEffect(() => {
    const orb = orbRef.current;
    const bounds = getBounds();
    if (orb === null || bounds === null) return;

    const rect = orb.getBoundingClientRect();
    let storedPosition: OrbPosition | null = null;
    try {
      storedPosition = parseStoredOrbPosition(
        window.localStorage.getItem(EXECUTIVE_ORB_POSITION_STORAGE_KEY),
      );
    } catch {
      // Keep the CSS default when storage cannot be read.
    }

    updatePosition(
      clampOrbPosition(storedPosition ?? { x: rect.left, y: rect.top }, bounds),
    );
  }, [getBounds, updatePosition]);

  useEffect(() => {
    const handleResize = () => {
      safeAreaRef.current = null;
      const currentPosition = positionRef.current;
      const bounds = getBounds();
      if (currentPosition === null || bounds === null) return;

      const clampedPosition = clampOrbPosition(currentPosition, bounds);
      if (
        clampedPosition.x !== currentPosition.x ||
        clampedPosition.y !== currentPosition.y
      ) {
        updatePosition(clampedPosition);
        persistPosition(clampedPosition);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [getBounds, persistPosition, updatePosition]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || interactionRef.current !== null) return;

    const rect = event.currentTarget.getBoundingClientRect();
    suppressClickRef.current = false;
    interactionRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      orbPosition: positionRef.current ?? { x: rect.left, y: rect.top },
      dragging: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      interactionRef.current = null;
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const interaction = interactionRef.current;
    if (interaction === null || interaction.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - interaction.pointerX;
    const deltaY = event.clientY - interaction.pointerY;
    if (!interaction.dragging && !exceedsDragThreshold(deltaX, deltaY)) return;

    if (!interaction.dragging) {
      interaction.dragging = true;
      suppressClickRef.current = true;
      setIsDragging(true);
    }
    event.preventDefault();

    const bounds = getBounds();
    if (bounds === null) return;
    updatePosition(
      clampOrbPosition(
        {
          x: interaction.orbPosition.x + deltaX,
          y: interaction.orbPosition.y + deltaY,
        },
        bounds,
      ),
    );
  };

  const finishPointerInteraction = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const interaction = interactionRef.current;
    if (interaction === null || interaction.pointerId !== event.pointerId) return;

    interactionRef.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // A browser may already have released capture during cancellation.
    }

    if (interaction.dragging) {
      setIsDragging(false);
      const finalPosition = positionRef.current;
      if (finalPosition !== null) persistPosition(finalPosition);
    }
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    openPanel();
  };

  const inlinePosition: CSSProperties = position === null
    ? {}
    : { right: "auto", bottom: "auto", left: position.x, top: position.y };

  return (
    <button
      ref={orbRef}
      aria-label="Metrix ile konuş"
      className={`fixed right-4 bottom-[calc(104px+env(safe-area-inset-bottom))] z-40 h-16 w-16 touch-none select-none overflow-hidden rounded-full border border-[#35dce3]/60 bg-[#071417] shadow-[0_8px_28px_rgba(20,180,187,0.28)] ${isDragging ? "cursor-grabbing" : "cursor-grab transition-transform hover:scale-[1.03] active:scale-[0.98]"} md:right-8 md:bottom-8`}
      data-presence-status={behaviorSnapshot.status}
      onClick={handleClick}
      onPointerCancel={finishPointerInteraction}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerInteraction}
      style={inlinePosition}
      type="button"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className="pointer-events-none h-full w-full select-none object-contain"
        draggable={false}
        src="/design/executive-presence-orb.png"
      />
    </button>
  );
}
