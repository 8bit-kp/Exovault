/**
 * Navigation structure (spec 13.3). Icons are resolved in the layout
 * components so this file stays plain data.
 */
export const APP_NAV = [
  { href: "/app/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/app/exposures", label: "Exposures", icon: "exposures" },
  { href: "/app/identities", label: "Identities", icon: "identities" },
  { href: "/app/monitoring", label: "Monitoring", icon: "monitoring" },
  { href: "/app/timeline", label: "Timeline", icon: "timeline" },
  { href: "/app/notifications", label: "Notifications", icon: "notifications" },
  { href: "/app/settings/profile", label: "Settings", icon: "settings" },
] as const;

export type AppNavIcon = (typeof APP_NAV)[number]["icon"];

export const MARKETING_NAV = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/security", label: "Security" },
  { href: "/privacy", label: "Privacy" },
  { href: "/about", label: "About" },
] as const;

export const AUTH_ROUTES = {
  signIn: "/auth/sign-in",
  signUp: "/auth/sign-up",
  verifyEmail: "/auth/verify-email",
  forgotPassword: "/auth/forgot-password",
  resetPassword: "/auth/reset-password",
  /** Where a signed-in account with a pending deletion is held (spec 5.2). */
  accountDeletion: "/auth/account-deletion",
} as const;
