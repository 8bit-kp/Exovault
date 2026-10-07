import nodemailer, { type Transporter } from "nodemailer";
import type { EmailMessage, EmailProvider } from "./interface";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/** SMTP transport: Mailpit in development, a transactional provider's SMTP relay in production. */
export function smtpEmailProvider(config: SmtpConfig): EmailProvider {
  const transport: Transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });
  return {
    name: "smtp",
    async send(message: EmailMessage) {
      await transport.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: { ...message.headers, "X-Exovault-Kind": message.kind },
      });
    },
  };
}
