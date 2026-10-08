import Link from "next/link";

export function SettingsNav({ current }: { current: "profile" | "security" | "notifications" | "privacy" }) {
  const items = [
    { key: "profile", href: "/app/settings/profile", label: "Profile" },
    { key: "security", href: "/app/settings/security", label: "Security" },
    { key: "notifications", href: "/app/settings/notifications", label: "Notifications" },
    { key: "privacy", href: "/app/settings/privacy", label: "Privacy" },
  ] as const;
  return (
    <nav aria-label="Settings sections" className="mt-2">
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
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
