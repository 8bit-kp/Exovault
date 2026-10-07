import { ExternalLink } from "lucide-react";

/**
 * Required credit for provider data (HIBP: CC BY 4.0, "clear and visible
 * attribution with a link"). Render wherever that data is shown.
 */
export function SourceAttribution({ attributions }: { attributions: Array<{ name: string; url: string }> }) {
  if (attributions.length === 0) return null;
  return (
    <p className="text-xs text-fg-subtle">
      Breach data from{" "}
      {attributions.map((a, i) => (
        <span key={a.url}>
          {i > 0 ? ", " : null}
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-fg-muted underline underline-offset-2 hover:text-fg"
          >
            {a.name}
            <ExternalLink aria-hidden className="size-3" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </span>
      ))}
      , used under its licence.
    </p>
  );
}
