import { LoadingState } from "@/components/ui/states";

/** Shown inside the app shell while a page's server data loads (navigation feedback). */
export default function AppLoading() {
  return (
    <div className="space-y-8">
      <div
        className="h-9 w-48 animate-signal rounded-sm bg-surface-2 motion-reduce:animate-none"
        aria-hidden
      />
      <LoadingState label="Loading" rows={3} />
    </div>
  );
}
