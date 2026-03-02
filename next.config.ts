import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Keep Prisma external so the native binary is not bundled into every function (reduces deploy size)
  serverExternalPackages: ['@prisma/client', 'prisma'],
  // Ensure Prisma binary is included in serverless function traces for API routes
  outputFileTracingIncludes: {
    '/api/**': [
      './lib/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node',
      './node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
      './lib/prisma-init.ts',
    ],
  },
};

export default nextConfig;
