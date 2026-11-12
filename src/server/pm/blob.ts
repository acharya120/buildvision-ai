import { put, del } from "@vercel/blob";
import type { BlobStore } from "./service";

/** Vercel Blob adapter. Needs the BLOB_READ_WRITE_TOKEN environment variable (added when you create a Blob store in Vercel). UNTESTED here: no Blob store was available to run it against. */
export function createBlobStore(token: string): BlobStore {
  return {
    async put(pathname, bytes, contentType) {
      const r = await put(pathname, Buffer.from(bytes), { access: "public", addRandomSuffix: true, contentType, token });
      return { url: r.url };
    },
    async del(url) { await del(url, { token }); },
  };
}
