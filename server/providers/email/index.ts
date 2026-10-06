import { getEnv } from "@/config/env";
import type { EmailProvider } from "./interface";
import { smtpEmailProvider } from "./smtp";

export type { EmailMessage, EmailProvider, EmailKind } from "./interface";

let provider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (!provider) {
    const env = getEnv();
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
