/**
 * Creates `.env.local` from `.env.example`, filling secrets with fresh random
 * values. Refuses to overwrite an existing file (secrets would be lost and
 * previously encrypted identifiers would become unreadable).
 *
 * Usage: npm run env:init
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = ".env.local";
if (existsSync(target)) {
  console.error(
    `${target} already exists — not overwriting. Delete it manually if you really want new secrets.`,
  );
  process.exit(1);
}

const key = () => randomBytes(32).toString("base64");
const replacements: Record<string, string> = {
  IDENTIFIER_ENCRYPTION_KEYS: `v1:${key()}`,
  IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID: "v1",
  BLIND_INDEX_PEPPER: key(),
  AUTH_SECRET: randomBytes(48).toString("base64url"),
};

const output = readFileSync(".env.example", "utf8")
  .split("\n")
  .map((line) => {
    const name = line.split("=")[0];
    return name in replacements ? `${name}=${replacements[name]}` : line;
  })
  .join("\n");

writeFileSync(target, output, { mode: 0o600 });
console.log(`Wrote ${target} with freshly generated secrets.`);
