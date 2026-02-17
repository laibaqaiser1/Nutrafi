import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Ensure Prisma binaries are included in serverless functions
  outputFileTracingIncludes: {
    '/api/**': [
      './lib/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node',
      './lib/generated/prisma/libquery_engine-debian-openssl-3.0.x.so.node',
      './node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
      './node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node'
    ],
  },
};

export default nextConfig;
