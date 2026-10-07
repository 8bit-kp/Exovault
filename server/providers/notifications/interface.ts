import type { ExposureSeverity } from "@/lib/domain/exposure";
import type { NotificationChannel, NotificationKind } from "@/lib/domain/notifications";

/**
 * Channel-agnostic alert delivery (spec Part 10). Email first; other channels
 * implement the same interface. Business logic builds an AlertDelivery and
 * never touches a vendor SDK.
 */
export interface AlertItem {
  kind: NotificationKind;
  severity: ExposureSeverity;
  /** Null when the source is sensitive: never named outside the app (spec 2.3). */
  sourceName: string | null;
  identityMasked: string;
  detectedAt: Date;
  recommendedAction: string;
  link: string;
}

export interface AlertDelivery {
  to: string;
  items: AlertItem[];
  digest: boolean;
  timezone: string;
  preferencesUrl: string;
  /** Human confirmation page (link in the email body). */
  unsubscribeUrl: string;
  /** RFC 8058 one-click endpoint (List-Unsubscribe header): mail clients POST to it. */
  oneClickUnsubscribeUrl: string;
}

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  send(delivery: AlertDelivery): Promise<void>;
}
