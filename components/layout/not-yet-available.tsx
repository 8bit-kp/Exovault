import { Construction } from "lucide-react";
import { PageHeader } from "./page-header";
import { EmptyState } from "@/components/ui/states";

/** Honest placeholder for an app section that hasn't shipped. Never shows fake data. */
export function NotYetAvailable({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-8">
      <PageHeader title={title} />
      <EmptyState icon={Construction} title="Not available yet" description={description} />
    </div>
  );
}
