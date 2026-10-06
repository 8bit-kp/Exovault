/** First focusable element on every page (WCAG 2.4.1). Target: <main id="main">. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="fixed top-2 left-2 z-100 -translate-y-20 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-transform focus-visible:translate-y-0"
    >
      Skip to content
    </a>
  );
}
