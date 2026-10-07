import { isTerminalScanState } from "@/lib/domain/scan";
import { getSession } from "@/lib/auth/session";
import { json, notFound, unauthorized } from "@/lib/http/responses";
import { RATE_LIMITS } from "@/config/rate-limits";
import { getAuth } from "@/lib/auth/server";
import { limit } from "@/lib/rate-limit";
import { getScanForUser } from "@/server/services/scan/scan-service";

/**
 * Server-Sent Events for one scan (spec Part 8). Reads the persisted scan
 * once a second on the server and emits only when it changes; the browser
 * never polls tightly. Ends at a terminal state, after MAX_DURATION_MS, or
 * when the client disconnects.
 */
const INTERVAL_MS = 1_000;
const HEARTBEAT_MS = 15_000;
const MAX_DURATION_MS = 5 * 60_000;
const SESSION_RECHECK_TICKS = 10;

export async function GET(request: Request, { params }: RouteContext<"/api/scans/[id]/events">) {
  const session = await getSession();
  if (!session) return unauthorized();
  const userId = session.user.id;
  // Each stream polls the database: cap how many a user can open (D-035).
  const budget = await limit(RATE_LIMITS.scanStreamsPerUser, userId).catch(() => null);
  if (!budget?.allowed) return json({ error: "rate_limited" }, 429);
  const { id } = await params;
  const first = await getScanForUser(userId, id);
  if (!first) return notFound();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = Date.now();
      let lastSent = "";
      let lastBeat = Date.now();
      let closed = false;
      let ticks = 0;
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      };
      request.signal.addEventListener("abort", close);

      let scan = first;
      while (!closed) {
        const payload = JSON.stringify(scan);
        if (payload !== lastSent) {
          controller.enqueue(encoder.encode(`event: scan\ndata: ${payload}\n\n`));
          lastSent = payload;
        } else if (Date.now() - lastBeat > HEARTBEAT_MS) {
          controller.enqueue(encoder.encode(`: keep-alive\n\n`));
          lastBeat = Date.now();
        }
        if (isTerminalScanState(scan.state) || Date.now() - started > MAX_DURATION_MS) break;
        await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
        if (closed) break;
        // A revoked session (sign-out, "sign out other sessions", password reset) ends the stream.
        if (++ticks % SESSION_RECHECK_TICKS === 0) {
          const stillValid = await getAuth()
            .api.getSession({ headers: request.headers })
            .catch(() => null);
          if (!stillValid || stillValid.user.id !== userId) break;
        }
        const next = await getScanForUser(userId, id);
        if (!next) break;
        scan = next;
      }
      close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
