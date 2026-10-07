import type { Metadata } from "next";
import { UnsubscribeForm } from "@/components/notifications/unsubscribe-form";

// The token in the URL must not leak via Referer.
export const metadata: Metadata = {
  title: "Stop alert emails",
  referrer: "no-referrer",
  robots: { index: false },
};

export default async function UnsubscribePage({ searchParams }: PageProps<"/notifications/unsubscribe">) {
  const { token } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <h1 className="text-2xl font-semibold text-fg">Stop exposure alert emails?</h1>
      <p className="mt-2 mb-6 text-sm text-fg-muted">
        This turns off email alerts for your account. Account emails (like password resets) still arrive.
      </p>
      {typeof token === "string" && token.length < 2048 ? (
        <UnsubscribeForm token={token} />
      ) : (
        <p className="text-sm text-fg-muted">This link is incomplete. Use the link from the alert email.</p>
      )}
    </div>
  );
}
