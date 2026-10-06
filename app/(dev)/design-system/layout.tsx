import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

export default function DesignSystemLayout({ children }: LayoutProps<"/design-system">) {
  return children;
}
