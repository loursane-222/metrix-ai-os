import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { OTP_EXPIRES_IN_MINUTES } from "@/lib/auth/shared/auth.constants";
import { buildOtpEmailContent } from "../email.service";

describe("OTP email template", () => {
  it("matches the premium content contract", () => {
    const content = buildOtpEmailContent("123456");
    expect({
      subject: content.subject,
      hasBrand: content.html.includes("METRIX"),
      hasProduct: content.html.includes("AI EXECUTIVE OS"),
      hasCode: content.html.includes("123456"),
      hasExpiry: content.html.includes(`${OTP_EXPIRES_IN_MINUTES} dakika`),
      hasSafetyCopy: content.html.includes("Bu işlemi siz başlatmadıysanız"),
      hasSupport: content.html.includes("support@metrixgm.com"),
    }).toMatchInlineSnapshot(`
      {
        "hasBrand": true,
        "hasCode": true,
        "hasExpiry": true,
        "hasProduct": true,
        "hasSafetyCopy": true,
        "hasSupport": true,
        "subject": "METRIX doğrulama kodunuz",
      }
    `);
  });

  it("provides complete plain text without exposing HTML", () => {
    const { text } = buildOtpEmailContent("654321");
    expect(text).toContain("METRIX — AI Executive OS");
    expect(text).toContain("654321");
    expect(text).toContain(`${OTP_EXPIRES_IN_MINUTES} dakika geçerlidir.`);
    expect(text).toContain("Bu işlemi siz başlatmadıysanız");
    expect(text).not.toContain("<html");
  });

  it("declares responsive and dark-mode email support", () => {
    const { html } = buildOtpEmailContent("123456");
    expect(html).toContain('name="viewport"');
    expect(html).toContain('name="color-scheme"');
    expect(html).toContain("prefers-color-scheme:light");
    expect(html).toContain("@media(max-width:480px)");
  });

  it("uses transactional sender and reply-to configuration without marketing unsubscribe headers", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/auth/otp/email.service.ts"), "utf8");
    expect(source).toContain("process.env.EMAIL_FROM");
    expect(source).toContain("process.env.EMAIL_REPLY_TO");
    expect(source).toContain("replyTo:");
    expect(source).not.toContain("List-Unsubscribe");
    expect(source).not.toContain("Message-ID");
  });
});
