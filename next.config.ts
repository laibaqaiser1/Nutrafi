import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Ensure Prisma binaries from node_modules are included
  // Vercel should automatically include node_modules, but we explicitly trace them
  outputFileTracingIncludes: {
    '/api/**': ['./node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node'],
  },
};

export default nextConfig;
