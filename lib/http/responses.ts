/** Small, safe JSON responses for Route Handlers: fixed messages, no stack traces, never cached. */
const NO_STORE = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE });
}

export const unauthorized = () => json({ error: "unauthorized" }, 401);
/** Used for both "doesn't exist" and "belongs to someone else" (spec 12.1). */
export const notFound = () => json({ error: "not_found" }, 404);
