// Existing customer-document-attachment.service.ts only checks the
// client-supplied `file.type` header — a browser/client-controlled string,
// trivially spoofable (rename a .exe to .pdf, keep the multipart
// Content-Type as application/pdf). This checks the actual leading bytes of
// the uploaded content against each supported format's real magic number,
// closing that gap. Used by both the new generic document pipeline and
// retrofitted into the existing customer attachment path.
export type SniffedMimeType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) if (bytes[i] !== signature[i]) return false;
  return true;
}

function isWebp(bytes: Uint8Array): boolean {
  // RIFF....WEBP — "RIFF" at 0, size u32 at 4, "WEBP" at 8.
  if (bytes.length < 12) return false;
  const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const webp = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  return riff === "RIFF" && webp === "WEBP";
}

/** Returns the real format detected from content bytes, or null if it matches none of the four supported formats. */
export function sniffFileSignature(bytes: Uint8Array): SniffedMimeType | null {
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, PDF)) return "application/pdf";
  if (isWebp(bytes)) return "image/webp";
  return null;
}

/** Throws unless the declared MIME type is actually consistent with the file's real content bytes. */
export function assertFileSignatureMatchesDeclaredMime(bytes: Uint8Array, declaredMimeType: string): void {
  const sniffed = sniffFileSignature(bytes);
  if (!sniffed || sniffed !== declaredMimeType) throw new Error("ATTACHMENT_CONTENT_MIME_MISMATCH");
}
