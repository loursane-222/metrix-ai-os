import { describe, expect, it } from "vitest";
import { resolveActorDisplayName } from "../user-display-name";

describe("resolveActorDisplayName", () => {
  it("prefers fullName when set", () => {
    expect(resolveActorDisplayName({ fullName: "Ahmet Ateş", email: "ahmet@example.com", phone: "+905551112233" } as never)).toBe("Ahmet Ateş");
  });

  it("falls back to email when fullName is missing", () => {
    expect(resolveActorDisplayName({ fullName: null, email: "ahmet@example.com", phone: "+905551112233" } as never)).toBe("ahmet@example.com");
  });

  it("falls back to a masked phone when fullName and email are both missing", () => {
    expect(resolveActorDisplayName({ fullName: null, email: null, phone: "+905551112233" } as never)).toBe("•••2233");
  });

  it("falls back to the generic label only when nothing identifying is available", () => {
    expect(resolveActorDisplayName(null)).toBe("Bir ekip üyesi");
    expect(resolveActorDisplayName({ fullName: "  ", email: null, phone: "" } as never)).toBe("Bir ekip üyesi");
  });
});
