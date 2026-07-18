export const EXECUTIVE_ORB_POSITION_STORAGE_KEY =
  "metrix-executive-orb-position-v1";

export const EXECUTIVE_ORB_DRAG_THRESHOLD = 8;

export type OrbPosition = {
  x: number;
  y: number;
};

export type OrbBounds = {
  viewportWidth: number;
  viewportHeight: number;
  orbWidth: number;
  orbHeight: number;
  horizontalInset: number;
  topInset: number;
  bottomInset: number;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function clampOrbPosition(
  position: OrbPosition,
  bounds: OrbBounds,
): OrbPosition {
  return {
    x: clamp(
      position.x,
      bounds.horizontalInset,
      bounds.viewportWidth - bounds.orbWidth - bounds.horizontalInset,
    ),
    y: clamp(
      position.y,
      bounds.topInset,
      bounds.viewportHeight - bounds.orbHeight - bounds.bottomInset,
    ),
  };
}

export function getDefaultOrbPosition(
  bounds: OrbBounds,
  rightInset: number,
): OrbPosition {
  return clampOrbPosition(
    {
      x: bounds.viewportWidth - bounds.orbWidth - rightInset,
      y: bounds.viewportHeight - bounds.orbHeight - bounds.bottomInset,
    },
    bounds,
  );
}

export function parseStoredOrbPosition(value: string | null): OrbPosition | null {
  if (value === null) return null;

  try {
    const payload: unknown = JSON.parse(value);
    if (typeof payload !== "object" || payload === null) return null;

    const candidate = payload as Record<string, unknown>;
    if (
      candidate.version !== 1 ||
      typeof candidate.x !== "number" ||
      typeof candidate.y !== "number" ||
      !Number.isFinite(candidate.x) ||
      !Number.isFinite(candidate.y)
    ) {
      return null;
    }

    return { x: candidate.x, y: candidate.y };
  } catch {
    return null;
  }
}

export function serializeOrbPosition(position: OrbPosition): string {
  return JSON.stringify({ version: 1, x: position.x, y: position.y });
}

export function exceedsDragThreshold(
  deltaX: number,
  deltaY: number,
  threshold = EXECUTIVE_ORB_DRAG_THRESHOLD,
): boolean {
  return Math.hypot(deltaX, deltaY) >= threshold;
}
