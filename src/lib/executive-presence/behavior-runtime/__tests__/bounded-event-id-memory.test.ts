import { describe, expect, it } from "vitest";

import { createBoundedEventIdMemory } from "../bounded-event-id-memory";

describe("Bounded Event ID Memory", () => {
  it("preserves FIFO eviction and ignores duplicates while remembered", () => {
    const memory = createBoundedEventIdMemory(2);

    expect(memory.remember("first")).toBe(true);
    expect(memory.remember("second")).toBe(true);
    expect(memory.remember("first")).toBe(false);
    expect(memory.remember("third")).toBe(true);
    expect(memory.remember("first")).toBe(true);
    expect(memory.remember("second")).toBe(true);
  });

  it("supports capacity one", () => {
    const memory = createBoundedEventIdMemory(1);

    expect(memory.remember("first")).toBe(true);
    expect(memory.remember("first")).toBe(false);
    expect(memory.remember("second")).toBe(true);
    expect(memory.remember("first")).toBe(true);
  });

  it("clear releases all bounded idempotency memory", () => {
    const memory = createBoundedEventIdMemory(2);
    memory.remember("first");
    memory.remember("second");

    memory.clear();

    expect(memory.remember("first")).toBe(true);
    expect(memory.remember("second")).toBe(true);
  });
});
