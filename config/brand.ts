/**
 * Single source of truth for product identity. Never hardcode these strings
 * in components, emails, or metadata — import from here.
 */
export const brand = {
  name: "Consltek Breach Monitoring",
  /** URL- and header-safe form of the name (file names, User-Agent). */
  slug: "consltek-breach-monitoring",
  /** Two-line wordmark: the full name is too wide for the sidebar on one spaced-caps line. */
  wordmark: { primary: "Consltek", secondary: "Breach Monitoring" },
  tagline: "Know what is exposed. Know what to do next.",
  description:
    "A privacy-first exposure intelligence platform for individuals. It reports what its configured providers know about your verified identifiers — it is not a dark-web crawler and does not guarantee complete coverage.",
  domain: "exovault.example",
  supportEmail: "security@exovault.example",
} as const;

export type Brand = typeof brand;
