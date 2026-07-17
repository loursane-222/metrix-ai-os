import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const engineSource = readFileSync(
  fileURLToPath(new URL("../executive-presence-engine.ts", import.meta.url)),
  "utf8",
);
const memorySource = readFileSync(
  fileURLToPath(new URL("../bounded-event-id-memory.ts", import.meta.url)),
  "utf8",
);

describe("Behavior Runtime source boundaries", () => {
  it("uses explicit comparison rather than object serialization", () => {
    const serializationCall = ["JSON", "stringify"].join(".");
    expect(engineSource).not.toContain(serializationCall);
    expect(engineSource).toContain("areExecutivePresenceSnapshotsMeaningfullyEqual");
  });

  it("uses indexed ring-buffer eviction rather than front-removal", () => {
    const frontRemovalCall = [".", "shift", "("].join("");
    expect(memorySource).not.toContain(frontRemovalCall);
    expect(memorySource).toContain("nextSlot = (nextSlot + 1) % capacity");
  });

  it("clears bounded idempotency memory during engine destroy", () => {
    expect(engineSource).toContain("processedEventIds.clear();");
  });
});
