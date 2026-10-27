/**
 * Sends ONE test email through the configured transport (EMAIL_TRANSPORT) to a
 * recipient you name, so you can check sender setup without touching users.
 *
 * Usage: npm run email:test -- --to you@consltek.com
 *
 * "accepted" below means the provider took the message. Delivery is confirmed
 * only by the inbox, or by Sender's Transactional emails → Logs.
 */
import { brand } from "@/config/brand";
import { getEnv, parseMailbox } from "@/config/env";
import { getEmailProvider } from "@/server/providers/email";

async function main() {
  const index = process.argv.indexOf("--to");
  const to = index >= 0 ? process.argv[index + 1] : undefined;
  if (!to || !parseMailbox(to) || to.includes("<")) {
    console.error("Usage: npm run email:test -- --to you@your-domain.com   (a mailbox you control)");
    process.exitCode = 2;
    return;
  }
  const env = getEnv();
  const provider = getEmailProvider();
  console.log(`Transport: ${env.EMAIL_TRANSPORT} (${provider.name}); from: ${env.EMAIL_FROM}`);
  if (provider.name === "demo-discard") {
    console.error("DEMO_MODE=on discards every email, so nothing would be sent. Turn demo mode off first.");
    process.exitCode = 1;
    return;
  }
  const sentAt = new Date().toISOString();
  try {
    await provider.send({
      to,
      kind: "verify-email",
      subject: `${brand.name}: email delivery test`,
      text: `This is a delivery test from ${brand.name} (${env.APP_URL}), sent ${sentAt}. No action is needed.`,
      html: `<p>This is a delivery test from <strong>${brand.name}</strong> (${env.APP_URL}), sent ${sentAt}.</p><p>No action is needed.</p>`,
    });
    console.log(
      "Accepted by the provider. Now check the inbox (and spam folder), and for Sender: Transactional emails → Logs.",
    );
  } catch (error) {
    console.error(`Not sent: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  }
}

void main();
