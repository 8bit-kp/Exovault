import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
