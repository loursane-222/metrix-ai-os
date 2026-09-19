import { describe, expect, it } from "vitest";

import { buildInvitationEmail } from "../../src/lib/platform/access-service";

describe("platform invitation email", () => {
  it("renders the corporate direct invitation with a plain-text CTA fallback", () => {
    const email = buildInvitationEmail({ name: "Ayşe Demir", url: "https://metrix.test/invite?token=opaque", expiresInDays: 7, baseUrl: "https://metrix.test", kind: "DIRECT" });
    expect(email.subject).toBe("METRIX'e davet edildiniz");
    expect(email.text).toContain("Daveti Kabul Et: https://metrix.test/invite?token=opaque");
    expect(email.html).toContain("metrix-wordmark-white.png");
    expect(email.html).toContain("Daveti Kabul Et");
  });

  it("keeps approved-application messaging distinct from a direct invitation", () => {
    const email = buildInvitationEmail({ name: "Ayşe Demir", url: "https://metrix.test/invite?token=opaque", expiresInDays: 7, baseUrl: "https://metrix.test", kind: "APPLICATION_APPROVED" });
    expect(email.subject).toBe("METRIX başvurunuz onaylandı");
    expect(email.text).toContain("Başvurunuz onaylandı.");
  });
});
