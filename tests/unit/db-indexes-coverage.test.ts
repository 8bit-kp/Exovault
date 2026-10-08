import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Production runs with Mongoose auto-indexing off, so `npm run db:indexes` is
 * the only thing that creates unique and TTL indexes. Every model must be in it.
 */
describe("npm run db:indexes", () => {
  it("syncs the indexes of every model in models/", () => {
    const script = readFileSync("scripts/db-indexes.ts", "utf8");
    const models = readdirSync("models")
      .filter((file) => file.endsWith(".ts"))
      .map((file) => file.replace(/\.ts$/, ""));
    expect(models.length).toBeGreaterThan(10);
    const missing = models.filter((model) => !new RegExp(`^\\s+${model},$`, "m").test(script));
    expect(missing).toEqual([]);
  });
});
