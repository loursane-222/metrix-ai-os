import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MetrixViewSurface } from "../../src/components/metrix-view/MetrixViewSurface";
import type { Presentation } from "../../src/lib/presentation/contracts";

// The repo's tsconfig keeps JSX as "preserve" (Next compiles it); under
// vitest the component's JSX becomes classic React.createElement calls.
(globalThis as { React?: typeof React }).React = React;

const render = (presentation: Presentation, onPrompt?: (text: string) => void) =>
  renderToStaticMarkup(createElement(MetrixViewSurface, { presentation, onPrompt }));

const mail: Presentation = {
  type: "MAIL",
  title: "E-posta",
  subject: "Teklif hakkında",
  from: "Ahmet Yılmaz <ahmet@example.test>",
  to: "owner@example.test",
  date: "16 Eyl 2026 13:00",
  unread: true,
  body: "Merhaba,\n\nTeklifi inceledik.",
  bodyTruncated: false,
  threadCount: 2
};

describe("MAIL presentation", () => {
  it("shows the sender, recipient, date, thread hint and the full body", () => {
    const html = render(mail);

    expect(html).toContain("Teklif hakkında");
    expect(html).toContain("Ahmet Yılmaz &lt;ahmet@example.test&gt;");
    expect(html).toContain("owner@example.test");
    expect(html).toContain("16 Eyl 2026 13:00");
    expect(html).toContain("Bu konuşmada 2 mesaj daha var");
    expect(html).toContain("Teklifi inceledik.");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).not.toContain("ilk bölümü gösteriliyor");
  });

  it("renders a sender-supplied body as inert text, never as markup", () => {
    const html = render({
      ...mail,
      body: '<img src=x onerror="alert(1)"><script>steal()</script>Merhaba'
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;steal()&lt;/script&gt;");
  });

  it("says so when the body was cut, and when there is no text", () => {
    expect(render({ ...mail, bodyTruncated: true })).toContain("ilk bölümü gösteriliyor");
    expect(render({ ...mail, body: "" })).toContain("Bu mailin metin içeriği yok.");
  });
});

describe("mail list rows", () => {
  const list: Presentation = {
    type: "LIST",
    title: "E-postalar",
    metrics: [{ label: "Kayıt", value: "2" }],
    rows: [
      { id: "1", primary: "Teklif hakkında", secondary: "Ahmet · 16 Eyl", unread: true, prompt: 'Şu maili aç: "Teklif hakkında" — Ahmet', raw: {} },
      { id: "2", primary: "Fatura kopyası", secondary: "Belgin", raw: {} }
    ]
  };

  it("marks unread mails and turns rows into open requests when there is a conversation to send them to", () => {
    const html = render(list, vi.fn());

    expect(html).toContain('aria-label="Okunmadı"');
    expect(html.match(/aria-label="Okunmadı"/g)).toHaveLength(1);
    // Only the row that carries a prompt is a button.
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Fatura kopyası");
  });

  it("without a conversation (e.g. the standalone voice page) rows are plain, not dead buttons", () => {
    expect(render(list)).not.toContain("<button");
  });

  it("other lists are unchanged: no unread dot, no buttons", () => {
    const html = render({
      type: "LIST",
      title: "Görevler",
      metrics: [{ label: "Kayıt", value: "1" }],
      rows: [{ id: "t1", primary: "Teklif gönder", secondary: "OPEN", raw: {} }]
    }, vi.fn());

    expect(html).not.toContain("Okunmadı");
    expect(html).not.toContain("<button");
  });
});
