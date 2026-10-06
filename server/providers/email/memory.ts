import type { EmailMessage, EmailProvider } from "./interface";

/** Captures messages in memory. Used by integration tests. */
export function memoryEmailProvider(): EmailProvider & { outbox: EmailMessage[]; clear(): void } {
  const outbox: EmailMessage[] = [];
  return {
    name: "memory",
    outbox,
    async send(message) {
      outbox.push(message);
    },
    clear() {
      outbox.length = 0;
    },
  };
}
