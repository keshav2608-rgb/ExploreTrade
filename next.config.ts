import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Provider credentials live only on the server (see src/lib/market-data).
  // Nothing prefixed NEXT_PUBLIC_ carries a secret.
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
};

export default nextConfig;
