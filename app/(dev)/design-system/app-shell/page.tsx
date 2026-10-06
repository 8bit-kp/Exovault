import { ScanLine } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { DemoDataLabel } from "@/components/ui/demo-data-label";
import { EmptyState } from "@/components/ui/states";

/** Preview of the signed-in shell. The real /app routes arrive with auth (Phase 3). */
export default function AppShellPreview() {
  return (
    <AppShell
      banner={
        <div className="flex items-center gap-2 border-b border-dashed border-warn/40 bg-warn/5 px-4 py-2 text-xs text-fg-muted lg:px-10">
          <DemoDataLabel /> Preview of the app layout. Navigation links lead to routes built in later phases.
        </div>
      }
    >
      <div className="space-y-8">
        <PageHeader
          title="Dashboard"
          description="Your verified identities and what the sources know about them."
          action={
            <Button>
              <ScanLine aria-hidden /> Run scan
            </Button>
          }
        />
        <EmptyState
          icon={ScanLine}
          title="You haven't scanned yet"
          description="Run your first scan to see which known breaches include your verified email address."
        />
      </div>
    </AppShell>
  );
}
