/**
 * Single source of truth for product identity. Never hardcode these strings
 * in components, emails, or metadata — import from here.
 */
export const brand = {
  name: "Exovault",
  tagline: "Know what is exposed. Know what to do next.",
  description:
    "A privacy-first exposure intelligence platform for individuals. Exovault reports what its configured providers know about your verified identifiers — it is not a dark-web crawler and does not guarantee complete coverage.",
  domain: "exovault.example",
  supportEmail: "security@exovault.example",
} as const;

export type Brand = typeof brand;
