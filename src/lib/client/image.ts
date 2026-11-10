/** Reads a picture the user chose and shrinks it in the browser so it stays small enough to save. */
export async function pictureToDataUrl(file: File, opts: { maxSide: number; type: "image/png" | "image/jpeg"; maxChars: number; square?: boolean }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { ok: false, error: "Choose a PNG, JPEG or WebP picture." };
  if (file.size > 8_000_000) return { ok: false, error: "That picture is too big. Choose one under 8 MB." };
  try {
    const src = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("bad image"));
      i.src = src;
    });
    URL.revokeObjectURL(src);
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    if (!w0 || !h0) return { ok: false, error: "That picture could not be read." };
    let sx = 0, sy = 0, sw = w0, sh = h0;
    if (opts.square) {
      const s = Math.min(w0, h0);
      sx = (w0 - s) / 2; sy = (h0 - s) / 2; sw = sh = s;
    }
    let scale = Math.min(1, opts.maxSide / Math.max(sw, sh));
    for (let round = 0; round < 6; round++) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(sw * scale));
      c.height = Math.max(1, Math.round(sh * scale));
      const g = c.getContext("2d");
      if (!g) return { ok: false, error: "This browser cannot resize pictures." };
      if (opts.type === "image/jpeg") { g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); }
      g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      const url = c.toDataURL(opts.type, 0.86);
      if (url.length <= opts.maxChars) return { ok: true, url };
      scale *= 0.75;
    }
    return { ok: false, error: "The picture is still too large after shrinking. Try a simpler picture." };
  } catch {
    return { ok: false, error: "That picture could not be read." };
  }
}
