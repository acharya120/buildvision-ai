import type { Ctx } from "../auth";
import type { BlobStore, PmCtx } from "./service";
import type { PmRepo } from "./repo";

let override: PmCtx | null | undefined;
const cache = new WeakMap<object, PmCtx>();

/** Lets tests plug in a fake repository and blob store. Not used in production. */
export function setPmForTests(c: PmCtx | null | undefined): void { override = c; }

/** The project-management storage for this request. The neon and blob modules are loaded only when needed. */
export async function getPm(ctx: Ctx): Promise<PmCtx> {
  if (override) return override;
  const hit = cache.get(ctx);
  if (hit) return hit;
  const { createNeonPmRepo } = await import("./neon");
  const pm: PmRepo = createNeonPmRepo(ctx.env.DATABASE_URL as string);
  let blob: BlobStore | null = null;
  if (ctx.env.BLOB_READ_WRITE_TOKEN) { const { createBlobStore } = await import("./blob"); blob = createBlobStore(ctx.env.BLOB_READ_WRITE_TOKEN); }
  const c: PmCtx = { pm, blob, now: () => Date.now() };
  cache.set(ctx, c);
  return c;
}
