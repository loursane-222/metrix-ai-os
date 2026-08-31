import { describe, expect, it } from "vitest";
import { assertFileSignatureMatchesDeclaredMime, sniffFileSignature } from "../file-signature";

describe("file-signature — real content-byte sniffing (defense against a spoofed Content-Type header)", () => {
  it("detects JPEG/PNG/PDF/WebP from their real magic bytes", () => {
    expect(sniffFileSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(sniffFileSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("image/png");
    expect(sniffFileSignature(new TextEncoder().encode("%PDF-1.7\n..."))).toBe("application/pdf");
    const webp = new Uint8Array(16);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    webp.set(new TextEncoder().encode("WEBP"), 8);
    expect(sniffFileSignature(webp)).toBe("image/webp");
  });

  it("returns null for content matching none of the four formats — e.g. an executable renamed to look like a PDF", () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // "MZ" — Windows PE header
    expect(sniffFileSignature(exe)).toBeNull();
  });

  it("returns null for a truncated/empty buffer rather than throwing", () => {
    expect(sniffFileSignature(new Uint8Array([]))).toBeNull();
    expect(sniffFileSignature(new Uint8Array([0xff]))).toBeNull();
  });

  it("assertFileSignatureMatchesDeclaredMime throws when the client-declared MIME lies about the real content", () => {
    const exeDisguisedAsPdf = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    expect(() => assertFileSignatureMatchesDeclaredMime(exeDisguisedAsPdf, "application/pdf")).toThrow("ATTACHMENT_CONTENT_MIME_MISMATCH");
  });

  it("assertFileSignatureMatchesDeclaredMime throws when the declared MIME doesn't match even a DIFFERENT real, supported format (e.g. a PNG uploaded declaring image/jpeg)", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(() => assertFileSignatureMatchesDeclaredMime(png, "image/jpeg")).toThrow("ATTACHMENT_CONTENT_MIME_MISMATCH");
  });

  it("assertFileSignatureMatchesDeclaredMime passes when the declared MIME matches the real content", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(() => assertFileSignatureMatchesDeclaredMime(jpeg, "image/jpeg")).not.toThrow();
  });
});
