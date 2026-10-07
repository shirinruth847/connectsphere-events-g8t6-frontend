import type { NextConfig } from "next";

// Protected pages must not be served from the browser cache after logout.
const PROTECTED_PATHS = ["/dashboard", "/dashboard/:path*", "/my-registrations", "/my-registrations/:path*"];

const nextConfig: NextConfig = {
  async headers() {
    return PROTECTED_PATHS.map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: "private, no-store" }],
    }));
  },
};

export default nextConfig;
