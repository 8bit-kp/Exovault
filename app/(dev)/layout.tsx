import { notFound } from "next/navigation";
import { getEnv } from "@/config/env";

/**
 * The /design-system pages are a component reference for development, not
 * part of the product: production returns the standard 404 unless
 * DESIGN_SYSTEM_PAGES=on (the E2E suite sets it).
 */
export default function DevLayout({ children }: LayoutProps<"/design-system">) {
  const env = getEnv();
  const enabled = (env.DESIGN_SYSTEM_PAGES ?? (env.NODE_ENV === "production" ? "off" : "on")) === "on";
  if (!enabled) notFound();
  return children;
}
