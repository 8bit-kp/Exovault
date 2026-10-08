import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The Docker image runs the traced, minimal server (Dockerfile sets NEXT_OUTPUT=standalone);
  // `next start` (local, CI, E2E) keeps the default output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: staticSecurityHeaders({ isProduction: process.env.NODE_ENV === "production" }),
      },
      {
        // JSON and SSE never need to load anything; deny everything if one is ever rendered as a document.
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
