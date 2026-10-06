/** Minimal Mailpit API client (https://mailpit.axllent.org/docs/api-v1/). */
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

interface MessageSummary {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
}

export async function waitForEmail(to: string, subjectIncludes: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await response.json()) as { messages: MessageSummary[] };
    const match = messages.find((m) => m.Subject.includes(subjectIncludes));
    if (match) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)).json()) as {
        Text: string;
      };
      return message.Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email "${subjectIncludes}" for ${to} within ${timeoutMs}ms`);
}

export function codeFrom(text: string): string {
  const code = text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error("No 6-digit code in email");
  return code;
}

export function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}
