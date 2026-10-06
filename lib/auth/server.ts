import "server-only";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { haveIBeenPwned } from "better-auth/plugins/haveibeenpwned";
import { getEnv } from "@/config/env";
import { AUTH_ROUTES } from "@/config/navigation";
import { recordAuditEvent } from "@/lib/audit";
import { getAuthDb } from "@/lib/db/mongo-client";
import { logger } from "@/lib/logging/logger";
import { scrubMessage } from "@/lib/logging/scrub";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { getEmailProvider } from "@/server/providers/email";
import {
  accountExistsMessage,
  passwordChangedMessage,
  resetPasswordMessage,
  verifyEmailMessage,
} from "@/server/services/notification/auth-emails";
import { sessionCookieConfig } from "./cookies";

/** Fire-and-forget email so response timing doesn't reveal whether an account exists. */
function sendInBackground(promise: Promise<unknown>): void {
  promise.catch((error: unknown) =>
    logger.error({ err: error instanceof Error ? error.name : "unknown" }, "background auth task failed"),
  );
}

function createAuth() {
  const env = getEnv();
  const cookies = sessionCookieConfig(env.APP_URL);
  const email = () => getEmailProvider();

  return betterAuth({
    appName: "Exovault",
    baseURL: env.APP_URL,
    secret: env.AUTH_SECRET,
    // No `client` passed: the adapter never starts transactions (standalone MongoDB, D-004).
    database: mongodbAdapter(getAuthDb(), { transaction: false }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      // Our own URL: the token lands on our page directly; no /api/auth surface is exposed.
      sendResetPassword: async ({ user, token }) => {
        const url = `${env.APP_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;
        await email().send(resetPasswordMessage(user.email, url));
      },
      onPasswordReset: async ({ user }) => {
        sendInBackground(
          email().send(passwordChangedMessage(user.email, `${env.APP_URL}/auth/forgot-password`)),
        );
        await recordAuditEvent({ event: "PASSWORD_RESET_COMPLETED", outcome: "success", userId: user.id });
      },
      // Enumeration-safe sign-up: an existing address gets an email, the caller gets the same response.
      onExistingUserSignUp: async ({ user }) => {
        sendInBackground(
          email().send(accountExistsMessage(user.email, `${env.APP_URL}${AUTH_ROUTES.signIn}`)),
        );
      },
    },

    emailVerification: {
      autoSignInAfterVerification: true,
      afterEmailVerification: async (user) => {
        await recordAuditEvent({ event: "EMAIL_VERIFIED", outcome: "success", userId: user.id });
      },
    },

    // Single-use reset tokens are stored as SHA-256 hashes, not in clear (spec Part 6).
    verification: { storeIdentifier: "hashed" },

    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 24 * 60 * 60,
      // No cookie cache: a revoked session stops working on the very next request.
      cookieCache: { enabled: false },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await recordAuditEvent({ event: "USER_CREATED", outcome: "success", userId: user.id });
          },
        },
      },
    },

    // All credential endpoints are called in-process from Server Actions that apply our
    // Redis rate limits first (D-018, D-020). The built-in limiter only covers HTTP routes.
    rateLimit: { enabled: false },

    advanced: {
      // Custom cookie names; `useSecureCookies` off so Better Auth doesn't prepend `__Secure-`
      // to our `__Host-` name. Secure is still set explicitly over HTTPS.
      useSecureCookies: false,
      cookiePrefix: cookies.prefix,
      defaultCookieAttributes: { secure: cookies.secure, httpOnly: true, sameSite: "lax", path: "/" },
      // We don't keep client IPs on session rows (data minimisation). Rate limits use our own keyed hashes.
      ipAddress: { disableIpTracking: true },
      // Keep CSRF/origin validation on in tests too, so security tests exercise it.
      disableOriginCheck: false,
      backgroundTasks: { handler: sendInBackground },
    },

    logger: {
      level: "warn",
      log: (level, message) => {
        const scrubbed = scrubMessage(message);
        if (level === "error") logger.error({ component: "better-auth" }, scrubbed);
        else if (level === "warn") logger.warn({ component: "better-auth" }, scrubbed);
        else logger.debug({ component: "better-auth" }, scrubbed);
      },
    },

    plugins: [
      emailOTP({
        // Replaces the default JWT link, which would put the email address in a URL and can't be revoked.
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        disableSignUp: true,
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 3,
        storeOTP: "hashed",
        sendVerificationOTP: async ({ email: to, otp, type }) => {
          if (type !== "email-verification") return; // Passwordless sign-in and OTP reset are not offered.
          await email().send(verifyEmailMessage(to, otp));
        },
      }),
      haveIBeenPwned({
        enabled: env.PASSWORD_BREACH_CHECK === "on",
        paths: ["/sign-up/email", "/reset-password", "/change-password"],
        customPasswordCompromisedMessage:
          "This password has appeared in a known data breach. Choose a different one; a long passphrase works well.",
      }),
      // Must stay last: lets auth.api calls in Server Actions set cookies.
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalCache = globalThis as typeof globalThis & { __exovaultAuth?: Auth };

export function getAuth(): Auth {
  globalCache.__exovaultAuth ??= createAuth();
  return globalCache.__exovaultAuth;
}

/** Test seam: rebuild after swapping env, email provider, or database. */
export function resetAuth(): void {
  globalCache.__exovaultAuth = undefined;
}
