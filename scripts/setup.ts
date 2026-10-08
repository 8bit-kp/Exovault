/**
 * One-command local setup: secrets (only if .env.local doesn't exist yet),
 * MongoDB indexes, and the demo account. Needs MongoDB running locally and
 * Redis (docker compose up -d, or native). Cross-platform: no shell syntax.
 *
 * Usage: npm run setup
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const run = (script: string) => execSync(`npm run --silent ${script}`, { stdio: "inherit" });

if (existsSync(".env.local")) console.log(".env.local exists: keeping your secrets.");
else run("env:init");
run("db:indexes");
run("seed");
console.log(
  "\nReady. Start the app with `npm run dev` and the worker with `npm run worker`, then sign in with the demo account above.",
);
