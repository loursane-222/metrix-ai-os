export type BoundedEventIdMemory = Readonly<{
  remember: (eventId: string) => boolean;
  clear: () => void;
}>;

/**
 * Fixed-capacity FIFO memory for event idempotency. Membership, insertion,
 * and eviction are O(1). It is deliberately bounded and is not an audit log.
 */
export function createBoundedEventIdMemory(limit: number): BoundedEventIdMemory {
  const capacity = Math.max(1, Math.floor(limit));
  const rememberedIds = new Set<string>();
  const slots = Array<string | undefined>(capacity);
  let nextSlot = 0;
  let size = 0;

  function remember(eventId: string): boolean {
    if (rememberedIds.has(eventId)) return false;

    if (size === capacity) {
      const evictedId = slots[nextSlot];
      if (evictedId !== undefined) rememberedIds.delete(evictedId);
    } else {
      size += 1;
    }

    slots[nextSlot] = eventId;
    nextSlot = (nextSlot + 1) % capacity;
    rememberedIds.add(eventId);
    return true;
  }

  function clear(): void {
    rememberedIds.clear();
    slots.fill(undefined);
    nextSlot = 0;
    size = 0;
  }

  return Object.freeze({ remember, clear });
}
