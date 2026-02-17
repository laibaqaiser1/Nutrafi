import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Ensure Prisma binaries are included in serverless functions
  experimental: {
    outputFileTracingIncludes: {
      '/api/**': ['./lib/generated/prisma/**/*.so.node'],
    },
  },
};

export default nextConfig;
