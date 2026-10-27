import { z } from "zod";
import { logger } from "@/lib/logging/logger";
import type { EmailMessage, EmailProvider } from "./interface";

/**
 * Sender.net transactional email over its REST API (D-042). Docs checked 2026-10-27:
 * POST https://api.sender.net/v2/message/send with `Authorization: Bearer <token>`,
 * a JSON body of from {email, name}, to {email}, subject, html, text, headers.
 * The `from` address must belong to a domain verified in the Sender account.
 *
 * A 2xx response means Sender *accepted* the message, not that it reached the
 * inbox; delivery is visible only in Sender's Transactional emails → Logs.
 *
 * No retries here: Sender has no idempotency key, so a retry after a timeout
 * could send twice. Callers decide (the alert dispatcher retries a bounded
 * number of times; auth emails surface the failure and offer "resend").
 */
export const SENDER_SEND_URL = "https://api.sender.net/v2/message/send";

export interface SenderConfig {
  apiToken: string;
  from: { email: string; name: string };
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** Carries the HTTP status and whether a later retry could succeed. Never the token or message content. */
export class SenderEmailError extends Error {
  constructor(
    readonly reason:
      "rejected" | "unauthorized" | "rate_limited" | "unavailable" | "timeout" | "invalid_response",
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(`Sender.net send failed: ${reason}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "SenderEmailError";
  }
}

const acceptedSchema = z.object({ success: z.literal(true) }).loose();

export function senderEmailProvider(config: SenderConfig): EmailProvider {
  const doFetch = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 15_000;
  return {
    name: "sender",
    async send(message: EmailMessage) {
      let response: Response;
      try {
        response = await doFetch(SENDER_SEND_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiToken}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            from: config.from,
            to: { email: message.to },
            subject: message.subject,
            html: message.html,
            text: message.text,
            headers: { ...message.headers, "X-Exovault-Kind": message.kind },
          }),
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (cause) {
        const name = (cause as { name?: string }).name;
        // A timeout is ambiguous: Sender may already have accepted the message.
        throw name === "TimeoutError" || name === "AbortError"
          ? new SenderEmailError("timeout", true)
          : new SenderEmailError("unavailable", true);
      }

      if (response.status === 401 || response.status === 403) {
        throw new SenderEmailError("unauthorized", false, response.status);
      }
      if (response.status === 429) throw new SenderEmailError("rate_limited", true, 429);
      if (response.status >= 500) throw new SenderEmailError("unavailable", true, response.status);
      // 400 / 422: bad parameters, e.g. a `from` address that isn't on a verified domain.
      if (!response.ok) throw new SenderEmailError("rejected", false, response.status);

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new SenderEmailError("invalid_response", false, response.status);
      }
      const parsed = acceptedSchema.safeParse(body);
      if (!parsed.success) throw new SenderEmailError("invalid_response", false, response.status);

      const emailId = (body as { emailId?: unknown }).emailId;
      // The id lets an operator find the message in Sender's logs. Never the recipient.
      logger.info(
        {
          emailProvider: "sender",
          kind: message.kind,
          emailId: typeof emailId === "string" ? emailId : undefined,
        },
        "email accepted by provider",
      );
    },
  };
}
