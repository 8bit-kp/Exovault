import { brand } from "@/config/brand";
import type { EmailMessage } from "@/server/providers/email";

/**
 * Account emails. Plain, text-first, no tracking pixels, no remote images.
 * Subjects never contain identifiers or sensitive detail (spec 2.3).
 */

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function layout(
  paragraphs: string[],
  action?: { label: string; url: string },
): { text: string; html: string } {
  const text = [
    ...paragraphs,
    ...(action ? [`${action.label}: ${action.url}`] : []),
    `— ${brand.name}`,
    `You received this because someone used this address on ${brand.name}. If it wasn't you, you can ignore it.`,
  ].join("\n\n");
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111;max-width:560px">
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
${action ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 16px;background:#0e7490;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(action.label)}</a></p><p style="font-size:12px;color:#555">Or paste this link into your browser:<br>${escapeHtml(action.url)}</p>` : ""}
<p style="font-size:12px;color:#555">— ${escapeHtml(brand.name)}. You received this because someone used this address on ${escapeHtml(brand.name)}. If it wasn't you, you can ignore it.</p>
</body></html>`;
  return { text, html };
}

/** One-time code (spec Part 6): single-use, 10-minute expiry, 3 attempts, stored hashed. */
export function verifyEmailMessage(to: string, code: string): EmailMessage {
  return {
    kind: "verify-email",
    to,
    subject: `Your ${brand.name} verification code`,
    ...layout([
      `Your verification code is: ${code}`,
      `Enter it on the ${brand.name} page that asked for it. It expires in 10 minutes and works once.`,
      "We will never ask you for this code by phone or chat.",
    ]),
  };
}

export function resetPasswordMessage(to: string, url: string): EmailMessage {
  return {
    kind: "reset-password",
    to,
    subject: `Reset your ${brand.name} password`,
    ...layout(
      [
        "Someone asked to set a new password for this account. If you just tried to sign up with this address, this link finishes setting up your account.",
        "The link expires in 30 minutes and works once. Resetting signs you out everywhere.",
        "If you didn't ask for this, ignore this email; your password stays the same.",
      ],
      { label: "Choose a new password", url },
    ),
  };
}

/** Sent instead of a second account when someone signs up with an existing address (enumeration-safe sign-up). */
export function accountExistsMessage(to: string, signInUrl: string): EmailMessage {
  return {
    kind: "account-exists",
    to,
    subject: `Your ${brand.name} account`,
    ...layout(
      [
        `Someone tried to create a ${brand.name} account with this email address, but you already have one.`,
        "If it was you, sign in instead. If you forgot your password, use “Forgot password” on the sign-in page.",
      ],
      { label: "Sign in", url: signInUrl },
    ),
  };
}

export function passwordChangedMessage(to: string, resetUrl: string): EmailMessage {
  return {
    kind: "password-changed",
    to,
    subject: `Your ${brand.name} password was changed`,
    ...layout(
      [
        `The password for your ${brand.name} account was just changed, and all sessions were signed out.`,
        "If this wasn't you, reset your password now.",
      ],
      { label: "Reset password", url: resetUrl },
    ),
  };
}

/**
 * Ownership check for a monitored identifier (spec Part 6 #2). Doesn't reveal
 * which account asked, and says plainly what happens if ignored.
 */
export function identityVerificationMessage(to: string, code: string): EmailMessage {
  return {
    kind: "identity-verification",
    to,
    subject: `Confirm ${brand.name} can check this address`,
    ...layout([
      `Someone asked ${brand.name} to check this email address against known data breaches. Before we check anything, the owner of the address has to confirm.`,
      `If that was you, enter this code in ${brand.name}: ${code}`,
      "It expires in 15 minutes and works once. If it wasn't you, ignore this email: nothing will be checked and the request expires on its own.",
    ]),
  };
}
