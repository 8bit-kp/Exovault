/**
 * Normalized source key (spec 7.5): different spellings of one source collide
 * ("Adobe", "Adobe Inc.", "adobe.com"), while genuinely different names don't
 * ("Adobe" vs "Adobe Creative Cloud"). Pure and deterministic.
 */
const LEGAL_SUFFIXES = new Set([
  "inc",
  "incorporated",
  "ltd",
  "limited",
  "llc",
  "llp",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "plc",
  "sa",
  "ag",
  "pty",
  "bv",
  "srl",
  "oy",
  "ab",
  "kk",
]);
const TLDS =
  /\.(com|net|org|io|co|info|biz|app|ai|me|tv|us|uk|de|fr|ru|cn|in|jp|br|au|ca|es|it|nl|pl)(\.[a-z]{2})?$/;

export function normalizeSourceKey(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/^www\./, "")
    .replace(TLDS, "")
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  // One trailing legal form only: "The Ticket Company Ltd" must not collapse into "Ticket".
  if (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) words.pop();
  if (words.length > 1 && words[0] === "the") words.shift();
  const key = words.join("");
  return key || "unknown";
}
