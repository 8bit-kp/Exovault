import Link from "next/link";

export function SettingsNav({ current }: { current: "profile" | "security" | "notifications" }) {
  const items = [
    { key: "profile", href: "/app/settings/profile", label: "Profile" },
    { key: "security", href: "/app/settings/security", label: "Security" },
    { key: "notifications", href: "/app/settings/notifications", label: "Notifications" },
  ] as const;
  return (
    <nav aria-label="Settings sections" className="mt-2">
      <ul className="flex gap-4">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              aria-current={current === item.key ? "page" : undefined}
              className={
                current === item.key
                  ? "font-medium text-fg underline decoration-accent underline-offset-8"
                  : "text-fg-muted hover:text-fg"
              }
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
