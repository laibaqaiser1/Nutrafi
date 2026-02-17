import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Ensure Prisma binaries are included in serverless functions
  // Use wildcard to catch all .so.node files in the Prisma output directory
  outputFileTracingIncludes: {
    '/api/**': ['./lib/generated/prisma/**/*.so.node'],
  },
};

export default nextConfig;
