import pino, { type DestinationStream, type Logger } from "pino";

/**
 * Central redaction list. Any key with one of these names is censored at the
 * top level and up to two levels deep. Identifiers must be referenced by ID in
 * logs; these keys are a safety net, not permission to log raw values.
 */
export const REDACTED_KEYS = [
  "password",
  "newPassword",
  "currentPassword",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "idToken",
  "otp",
  "verificationCode",
  "secret",
  "apiKey",
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "hibp-api-key",
  "x-api-key",
  "set-cookie",
  "email",
  "identifier",
  "normalizedValue",
  "valueEncrypted",
  "phone",
] as const;

const redactPaths = REDACTED_KEYS.flatMap((key) => {
  const k = /^[A-Za-z_$][\w$]*$/.test(key) ? key : `["${key}"]`;
  const dot = k.startsWith("[") ? "" : ".";
  return [k, `*${dot}${k}`, `*.*${dot}${k}`];
});

export const REDACTION_CENSOR = "[REDACTED]";

export function createLogger(
  options: { level?: string; base?: Record<string, unknown> } = {},
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      level: options.level ?? process.env.LOG_LEVEL ?? "info",
      base: options.base ?? { service: "exovault" },
      redact: { paths: redactPaths, censor: REDACTION_CENSOR },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
    },
    destination,
  );
}

/**
 * Output goes through a swappable sink so tests can capture the exact
 * serialized lines (after redaction) and scan them for planted secrets.
 */
let sink: DestinationStream | undefined;
const destination: DestinationStream = {
  write: (line: string) => {
    (sink ?? process.stdout).write(line);
  },
};

/** Test seam: capture log output. Pass undefined to restore stdout. */
export function setLogSink(next: DestinationStream | undefined): void {
  sink = next;
}

export const logger = createLogger({}, destination);
