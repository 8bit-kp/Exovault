import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, REDACTION_CENSOR } from "@/lib/logging/logger";

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { log: createLogger({ level: "trace" }, stream), output: () => lines.join("") };
}

describe("logger redaction", () => {
  const planted = {
    password: "hunter2-PLANTED",
    token: "tok-PLANTED",
    email: "victim-PLANTED@example.com",
    apiKey: "key-PLANTED",
    cookie: "session=PLANTED",
  };

  it("censors sensitive keys at the top level", () => {
    const { log, output } = captureLogger();
    log.info(planted, "top-level");
    expect(output()).not.toContain("PLANTED");
    expect(output()).toContain(REDACTION_CENSOR);
  });

  it("censors sensitive keys nested one and two levels deep", () => {
    const { log, output } = captureLogger();
    log.info({ req: { headers: { authorization: "Bearer PLANTED", cookie: "PLANTED" } } }, "nested");
    log.info({ user: planted }, "one level");
    expect(output()).not.toContain("PLANTED");
  });

  it("keeps non-sensitive operational fields", () => {
    const { log, output } = captureLogger();
    log.info({ requestId: "req-1", scanId: "scan-1", provider: "mock", durationMs: 12 }, "scan done");
    const entry = JSON.parse(output());
    expect(entry).toMatchObject({ requestId: "req-1", scanId: "scan-1", provider: "mock", level: "info" });
  });
});
