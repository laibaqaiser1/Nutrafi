// This script runs at the start of each serverless function to ensure Prisma binary is accessible
// It's imported in lib/prisma.ts to run before Prisma Client initialization

const fs = require('fs');
const path = require('path');

// Possible locations where the binary might be
const possibleLocations = [
  // Custom output location
  path.join(process.cwd(), 'lib/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node'),
  // node_modules fallback
  path.join(process.cwd(), 'node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node'),
  // Vercel deployment locations
  '/var/task/lib/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node',
  '/var/task/node_modules/.prisma/client/libquery_engine-rhel-openssl-3.0.x.so.node',
  '/vercel/path0/lib/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node',
];

// Find the binary
let binaryPath = null;
for (const location of possibleLocations) {
  try {
    if (fs.existsSync(location)) {
      binaryPath = location;
      break;
    }
  } catch {
    // Continue searching
  }
}

// If found, set environment variable for Prisma
if (binaryPath) {
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = binaryPath;
  console.log(`[Prisma] Found binary at: ${binaryPath}`);
} else {
  console.error('[Prisma] Binary not found in any expected location');
  // Try to copy from source if available
  const sourcePath = path.join(process.cwd(), 'lib/generated/prisma/libquery_engine-rhel-openssl-3.0.x.so.node');
  const targetPath = '/tmp/prisma-engines/libquery_engine-rhel-openssl-3.0.x.so.node';
  
  if (fs.existsSync(sourcePath)) {
    try {
      if (!fs.existsSync('/tmp/prisma-engines')) {
        fs.mkdirSync('/tmp/prisma-engines', { recursive: true });
      }
      fs.copyFileSync(sourcePath, targetPath);
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = targetPath;
      console.log(`[Prisma] Copied binary to: ${targetPath}`);
    } catch (error) {
      console.error('[Prisma] Failed to copy binary:', error.message);
    }
  }
}

module.exports = binaryPath;


