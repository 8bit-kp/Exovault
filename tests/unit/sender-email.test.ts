import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, setLogSink } from "@/lib/logging/logger";
import type { EmailMessage } from "@/server/providers/email";
import { SENDER_SEND_URL, SenderEmailError, senderEmailProvider } from "@/server/providers/email/sender";

const TOKEN = "planted-sender-token-0123456789abcdef";
const message: EmailMessage = {
  to: "recipient.zx81@example.com",
  subject: "Your verification code",
  text: "Code: 123456",
  html: "<p>Code: <b>123456</b></p>",
  kind: "verify-email",
  headers: { "List-Unsubscribe": "<https://app.example/unsub>" },
};

function reply(status: number, body?: unknown) {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

const providerWith = (fetchImpl: typeof fetch) =>
  senderEmailProvider({
    apiToken: TOKEN,
    from: { email: "kishanpal.singh@consltek.com", name: "Consltek" },
    fetch: fetchImpl,
    timeoutMs: 100,
  });

const previousLevel = logger.level;
afterEach(() => {
  setLogSink(undefined);
  logger.level = previousLevel;
});

describe("Sender.net email provider", () => {
  it("posts the documented request shape with a bearer token", async () => {
    const fetchImpl = reply(200, { success: true, message: "Email sent", emailId: "abc-123" });
    await providerWith(fetchImpl).send(message);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(SENDER_SEND_URL);
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      from: { email: "kishanpal.singh@consltek.com", name: "Consltek" },
      to: { email: message.to },
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: { "List-Unsubscribe": "<https://app.example/unsub>", "X-Exovault-Kind": "verify-email" },
    });
  });

  it("logs only the kind and Sender's email id: no token, recipient or content", async () => {
    const lines: string[] = [];
    setLogSink({ write: (line: string) => void lines.push(line) });
    logger.level = "trace";
    await providerWith(reply(200, { success: true, emailId: "abc-123" })).send(message);
    const out = lines.join("\n");
    expect(out).toContain("abc-123");
    expect(out).toContain("verify-email");
    for (const secret of [TOKEN, message.to, "123456"]) expect(out).not.toContain(secret);
  });

  it.each([
    [401, "unauthorized", false],
    [403, "unauthorized", false],
    [400, "rejected", false],
    [422, "rejected", false], // e.g. a from address on an unverified domain
    [429, "rate_limited", true],
    [500, "unavailable", true],
    [503, "unavailable", true],
  ])("HTTP %i → %s (retryable: %s), sent exactly once", async (status, reason, retryable) => {
    const fetchImpl = reply(status, { success: false, message: "nope" });
    const error = await providerWith(fetchImpl)
      .send(message)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SenderEmailError);
    expect(error).toMatchObject({ reason, retryable, status });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // no silent retries → no duplicates
  });

  it("does not treat a 2xx without success: true as sent", async () => {
    await expect(providerWith(reply(200, { success: false })).send(message)).rejects.toMatchObject({
      reason: "invalid_response",
    });
    await expect(providerWith(reply(200, "not json")).send(message)).rejects.toMatchObject({
      reason: "invalid_response",
    });
  });

  it("maps a timeout and a network failure to retryable errors", async () => {
    const hang = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)),
        ),
    );
    await expect(providerWith(hang).send(message)).rejects.toMatchObject({
      reason: "timeout",
      retryable: true,
    });
    const down = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(providerWith(down).send(message)).rejects.toMatchObject({
      reason: "unavailable",
      retryable: true,
    });
  });

  it("error messages never include the token or the recipient", async () => {
    const error = (await providerWith(reply(401))
      .send(message)
      .catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain(TOKEN);
    expect(error.message).not.toContain(message.to);
  });
});
