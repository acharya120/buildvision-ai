/** Accepts only real PNG, JPEG or WebP pictures sent as data URLs, and only up to a size limit. SVG is refused on purpose. */
export function checkImageDataUrl(value: unknown, maxChars: number): { ok: true; mime: string; bytes: Buffer } | { ok: false; error: string } {
  if (typeof value !== "string") return { ok: false, error: "The picture is not valid." };
  if (value.length > maxChars) return { ok: false, error: `The picture is too large (limit about ${Math.round(maxChars * 0.75 / 1000)} KB). Use a smaller picture.` };
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!m) return { ok: false, error: "Use a PNG, JPEG or WebP picture." };
  const bytes = Buffer.from(m[2], "base64");
  const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpg = bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const okType = (m[1] === "image/png" && png) || (m[1] === "image/jpeg" && jpg) || (m[1] === "image/webp" && webp);
  return okType ? { ok: true, mime: m[1], bytes } : { ok: false, error: "That file is not a real picture of the type it claims." };
}
