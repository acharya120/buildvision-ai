export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T & { error?: string };
}

/** Small fetch helper. Never throws: a network problem comes back as ok=false with a readable message. */
export async function api<T = Record<string, unknown>>(path: string, method: "GET" | "POST" | "PUT" | "DELETE" = "GET", body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    let data: unknown = {};
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    return { ok: res.ok, status: res.status, data: data as ApiResult<T>["data"] };
  } catch {
    return { ok: false, status: 0, data: { error: "Could not reach the server. Check your internet connection." } as ApiResult<T>["data"] };
  }
}
