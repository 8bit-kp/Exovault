import { getEnv, parseMailbox } from "@/config/env";
import type { EmailProvider } from "./interface";
import { senderEmailProvider } from "./sender";
import { smtpEmailProvider } from "./smtp";

export type { EmailMessage, EmailProvider, EmailKind } from "./interface";

let provider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (!provider) {
    const env = getEnv();
    if (env.EMAIL_TRANSPORT === "sender") {
      // config/env guarantees the token and a `Name <address>` EMAIL_FROM in this mode.
      const from = parseMailbox(env.EMAIL_FROM)!;
      provider = senderEmailProvider({
        apiToken: env.SENDER_API_TOKEN!,
        from: { email: from.email, name: from.name! },
      });
      return provider;
    }
    provider = smtpEmailProvider({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === "true",
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.EMAIL_FROM,
    });
  }
  return provider;
}

/** Test seam. */
export function setEmailProvider(next: EmailProvider | undefined): void {
  provider = next;
}
