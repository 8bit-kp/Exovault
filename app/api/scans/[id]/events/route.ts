import { isTerminalScanState } from "@/lib/domain/scan";
import { getSession } from "@/lib/auth/session";
import { notFound, unauthorized } from "@/lib/http/responses";
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

export async function GET(request: Request, { params }: RouteContext<"/api/scans/[id]/events">) {
  const session = await getSession();
  if (!session) return unauthorized();
  const userId = session.user.id;
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
