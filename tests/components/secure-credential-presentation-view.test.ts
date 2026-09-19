import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MetrixViewSurface } from "../../src/components/metrix-view/MetrixViewSurface";
import type { Presentation } from "../../src/lib/presentation/contracts";

(globalThis as { React?: typeof React }).React = React;

const presentation: Presentation = {
  type: "SECURE_CREDENTIAL",
  title: "BizimHesap'ı Bağla",
  provider: "BIZIMHESAP",
  description: "Erişim anahtarını güvenli alana gir.",
  secretNotice: "Bu bilgi gizlidir: sohbete yazma, sesli söyleme.",
  steps: ["Hesabına giriş yap.", "Anahtarı kopyala."],
  fields: [{ name: "token", label: "BizimHesap erişim anahtarı (token)" }],
  submitUrl: "/api/integrations/bizimhesap/connect",
  submitLabel: "Bağlan"
};

describe("SECURE_CREDENTIAL presentation", () => {
  const html = renderToStaticMarkup(createElement(MetrixViewSurface, { presentation }));

  it("renders the steps, the secret warning and one masked field", () => {
    expect(html).toContain("Hesabına giriş yap.");
    expect(html).toContain("sohbete yazma, sesli söyleme");
    expect(html).toContain("BizimHesap erişim anahtarı (token)");
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="off"');
  });

  it("starts with an empty field and a disabled submit, and never renders a prefilled value", () => {
    expect(html).toMatch(/<input[^>]*value=""/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="submit"|<button[^>]*type="submit"[^>]*disabled=""/);
  });

  it("is the same generic surface voice renders — no onPrompt is required", () => {
    expect(() =>
      renderToStaticMarkup(createElement(MetrixViewSurface, { presentation }))
    ).not.toThrow();
  });
});
