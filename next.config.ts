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
    ];
  },
};

export default nextConfig;
