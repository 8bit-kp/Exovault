/**
 * Email transport contract. Business logic depends on this interface only and
 * never imports a vendor SDK (spec 4.1).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Category for logs and metrics. Never the recipient. */
  kind: EmailKind;
}

export const EMAIL_KINDS = [
  "verify-email",
  "reset-password",
  "account-exists",
  "password-changed",
  "identity-verification",
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}
