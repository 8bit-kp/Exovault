import { brand } from "@/config/brand";
import { SEVERITY_LABELS } from "@/lib/domain/severity";
import { formatDateTime } from "@/lib/utils/format";
import type { EmailMessage } from "@/server/providers/email";
import type { AlertDelivery, AlertItem } from "@/server/providers/notifications/interface";

/**
 * Exposure alert emails (spec Part 10). Subjects carry no identifiers, no
 * source names and no severity words that would reveal detail on a lock
 * screen. Bodies show the masked identity, omit sensitive sources, and link
 * into the app, where the details live. No raw data, no secrets.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function headline(item: AlertItem): string {
  const source = item.sourceName ?? "a sensitive source (name hidden; see the app)";
  return item.kind === "new_exposure"
    ? `${SEVERITY_LABELS[item.severity]}: ${item.identityMasked} found in ${source}`
    : `${SEVERITY_LABELS[item.severity]}: more data now reported for ${item.identityMasked} in ${source}`;
}

export function alertEmailMessage(delivery: AlertDelivery): EmailMessage {
  const count = delivery.items.length;
  const subject = delivery.digest
    ? `${brand.name}: your daily exposure summary`
    : count === 1
      ? `${brand.name}: new exposure found for a monitored address`
      : `${brand.name}: ${count} new exposures found for your monitored addresses`;

  const intro = delivery.digest
    ? `Scheduled monitoring found ${count} new or changed exposure${count === 1 ? "" : "s"} since your last summary.`
    : `Scheduled monitoring found ${count === 1 ? "a new or changed exposure" : `${count} new or changed exposures`}.`;

  const text = [
    intro,
    ...delivery.items.map((item) =>
      [
        headline(item),
        `Detected: ${formatDateTime(item.detectedAt, { timeZone: delivery.timezone })}`,
        `What to do first: ${item.recommendedAction}`,
        `Details: ${item.link}`,
      ].join("\n"),
    ),
    "Results reflect the sources we check, not every breach.",
    `Change how and when you get alerts: ${delivery.preferencesUrl}`,
    `Stop alert emails: ${delivery.unsubscribeUrl}`,
  ].join("\n\n");

  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#111;max-width:600px">
<p>${escapeHtml(intro)}</p>
${delivery.items
  .map(
    (item) => `<div style="border:1px solid #ddd;border-radius:6px;padding:12px 16px;margin:12px 0">
<p style="margin:0 0 6px;font-weight:600">${escapeHtml(headline(item))}</p>
<p style="margin:0 0 6px;font-size:13px;color:#444">Detected ${escapeHtml(formatDateTime(item.detectedAt, { timeZone: delivery.timezone }))}</p>
<p style="margin:0 0 10px;font-size:14px">What to do first: ${escapeHtml(item.recommendedAction)}</p>
<a href="${escapeHtml(item.link)}" style="display:inline-block;padding:8px 14px;background:#0e7490;color:#fff;text-decoration:none;border-radius:6px">Open in ${escapeHtml(brand.name)}</a>
</div>`,
  )
  .join("\n")}
<p style="font-size:12px;color:#555">Results reflect the sources we check, not every breach.</p>
<p style="font-size:12px;color:#555"><a href="${escapeHtml(delivery.preferencesUrl)}">Alert preferences</a> · <a href="${escapeHtml(delivery.unsubscribeUrl)}">Stop alert emails</a></p>
</body></html>`;

  return {
    kind: delivery.digest ? "exposure-digest" : "exposure-alert",
    to: delivery.to,
    subject,
    text,
    html,
    headers: {
      // RFC 2369 / RFC 8058 one-click unsubscribe.
      "List-Unsubscribe": `<${delivery.oneClickUnsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
