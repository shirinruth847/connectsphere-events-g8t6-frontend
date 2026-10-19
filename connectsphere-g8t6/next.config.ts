import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || "http://localhost:8000" },
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
  async headers() { return [{ source: "/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] }]; },
};
export default nextConfig;
