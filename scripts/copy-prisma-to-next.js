const fs = require('fs');
const path = require('path');

// Copy Prisma binaries to .next/server directory so they're available at runtime
const sourceDir = path.join(__dirname, '../lib/generated/prisma');
const nodeModulesSource = path.join(__dirname, '../node_modules/.prisma/client');

const rhelBinary = 'libquery_engine-rhel-openssl-3.0.x.so.node';

// Find source binary
let sourcePath = path.join(sourceDir, rhelBinary);
if (!fs.existsSync(sourcePath)) {
  // Try node_modules
  sourcePath = path.join(nodeModulesSource, rhelBinary);
}

if (!fs.existsSync(sourcePath)) {
  console.error(`✗ Binary not found: ${rhelBinary}`);
  process.exit(1);
}

console.log(`✓ Found binary: ${sourcePath}`);

// Copy to .next/server/lib/generated/prisma (for Vercel serverless functions)
const nextServerDir = path.join(__dirname, '../.next/server/lib/generated/prisma');
if (fs.existsSync('.next/server')) {
  if (!fs.existsSync(nextServerDir)) {
    fs.mkdirSync(nextServerDir, { recursive: true });
  }
  const targetPath = path.join(nextServerDir, rhelBinary);
  try {
    fs.copyFileSync(sourcePath, targetPath);
    fs.chmodSync(targetPath, 0o755); // Make executable
    console.log(`✓ Copied to .next/server/lib/generated/prisma`);
  } catch (error) {
    console.warn(`⚠ Failed to copy to .next/server:`, error.message);
  }
}

// Copy to .next/standalone/lib/generated/prisma (for standalone builds)
const nextStandaloneDir = path.join(__dirname, '../.next/standalone/lib/generated/prisma');
if (fs.existsSync('.next/standalone')) {
  if (!fs.existsSync(nextStandaloneDir)) {
    fs.mkdirSync(nextStandaloneDir, { recursive: true });
  }
  const targetPath = path.join(nextStandaloneDir, rhelBinary);
  try {
    fs.copyFileSync(sourcePath, targetPath);
    fs.chmodSync(targetPath, 0o755);
    console.log(`✓ Copied to .next/standalone/lib/generated/prisma`);
  } catch (error) {
    console.warn(`⚠ Failed to copy to .next/standalone:`, error.message);
  }
}

// Also ensure it's in node_modules/.prisma/client (fallback)
const nodeModulesTarget = path.join(nodeModulesSource, rhelBinary);
if (!fs.existsSync(nodeModulesTarget) && fs.existsSync(nodeModulesSource)) {
  try {
    fs.copyFileSync(sourcePath, nodeModulesTarget);
    fs.chmodSync(nodeModulesTarget, 0o755);
    console.log(`✓ Copied to node_modules/.prisma/client`);
  } catch (error) {
    console.warn(`⚠ Failed to copy to node_modules:`, error.message);
  }
}

console.log('Prisma binaries copy complete.');

