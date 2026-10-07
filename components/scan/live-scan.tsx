"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScanProgress } from "@/components/monitoring/scan-progress";
import { ButtonLink } from "@/components/ui/button";
import { DemoDataLabel } from "@/components/ui/demo-data-label";
import { isTerminalScanState } from "@/lib/domain/scan";
import type { ScanView } from "@/server/services/scan/scan-service";
import { RetryFailedSourcesForm } from "./scan-forms";

/**
 * Live scan progress (spec Part 8). Subscribes to the scan's Server-Sent
 * Events stream; if that fails (proxy, network), falls back to fetching the
 * persisted state with exponential backoff. Everything shown comes from the
 * server; nothing advances on a client timer. Cleans up on unmount.
 */
export function LiveScan({
  initial,
  flow,
  resultsHref,
}: {
  initial: ScanView;
  flow: "onboarding" | "app";
  resultsHref: string;
}) {
  const [scan, setScan] = useState(initial);
  const router = useRouter();
  const terminal = isTerminalScanState(scan.state);

  useEffect(() => {
    if (isTerminalScanState(initial.state)) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | undefined;

    const apply = (next: ScanView) => {
      if (stopped) return;
      setScan(next);
      if (isTerminalScanState(next.state)) {
        stop();
        router.refresh(); // server-rendered summaries pick up the final state
      }
    };

    const poll = (delay: number) => {
      timer = setTimeout(async () => {
        try {
          const response = await fetch(`/api/scans/${initial.id}`, { cache: "no-store" });
          if (response.ok) apply((await response.json()) as ScanView);
        } catch {
          /* transient: try again with backoff */
        }
        if (!stopped) poll(Math.min(delay * 2, 10_000));
      }, delay);
    };

    const stop = () => {
      stopped = true;
      source?.close();
      if (timer) clearTimeout(timer);
    };

    if (typeof EventSource !== "undefined") {
      source = new EventSource(`/api/scans/${initial.id}/events`);
      source.addEventListener("scan", (event) =>
        apply(JSON.parse((event as MessageEvent<string>).data) as ScanView),
      );
      source.onerror = () => {
        source?.close();
        if (!stopped) poll(1_000);
      };
    } else {
      poll(1_000);
    }
    return stop;
  }, [initial.id, initial.state, router]);

  const failedSources = scan.providers.some((p) => p.state === "error");
  return (
    <div className="space-y-6">
      {scan.isDemo ? (
        <p className="flex items-center gap-2 text-xs text-fg-muted">
          <DemoDataLabel /> Demo sources: results are fictional.
        </p>
      ) : null}
      <ScanProgress
        state={scan.state}
        providers={scan.providers.map((p) => ({ name: p.displayName, state: p.state }))}
        retry={
          terminal && failedSources && scan.state !== "completed" ? (
            <RetryFailedSourcesForm scanId={scan.id} flow={flow} />
          ) : undefined
        }
      />
      {terminal && scan.state !== "failed" ? (
        <ButtonLink href={resultsHref} className="w-full">
          See results <ArrowRight aria-hidden />
        </ButtonLink>
      ) : null}
    </div>
  );
}
