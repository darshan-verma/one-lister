import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@one-lister/config", "@one-lister/db", "@one-lister/core"],
};

export default nextConfig;
