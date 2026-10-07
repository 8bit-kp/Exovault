import { getEmailProvider } from "@/server/providers/email";
import { alertEmailMessage } from "@/server/services/notification/alert-emails";
import type { NotificationProvider } from "./interface";

/** Email channel: renders the alert and hands it to the configured EmailProvider. */
export function emailNotificationProvider(): NotificationProvider {
  return {
    channel: "email",
    async send(delivery) {
      await getEmailProvider().send(alertEmailMessage(delivery));
    },
  };
}
