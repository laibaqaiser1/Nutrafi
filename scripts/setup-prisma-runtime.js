const fs = require('fs');
const path = require('path');

// This script ensures Prisma binaries are in all possible runtime locations
// Prisma searches in these locations at runtime:
// 1. __dirname (same directory as client.ts)
// 2. process.cwd() + relative path
// 3. node_modules/.prisma/client
// 4. /tmp/prisma-engines

const sourceDir = path.join(__dirname, '../lib/generated/prisma');
const nodeModulesDir = path.join(__dirname, '../node_modules/.prisma/client');
const tmpDir = '/tmp/prisma-engines';

const rhelBinary = 'libquery_engine-rhel-openssl-3.0.x.so.node';

// Ensure source binary exists
const sourcePath = path.join(sourceDir, rhelBinary);
if (!fs.existsSync(sourcePath)) {
  console.error(`✗ Required binary not found: ${sourcePath}`);
  process.exit(1);
}
console.log(`✓ Found binary: ${sourcePath}`);

// Copy to node_modules/.prisma/client
if (!fs.existsSync(nodeModulesDir)) {
  fs.mkdirSync(nodeModulesDir, { recursive: true });
}
const nodeModulesPath = path.join(nodeModulesDir, rhelBinary);
try {
  fs.copyFileSync(sourcePath, nodeModulesPath);
  console.log(`✓ Copied to node_modules/.prisma/client`);
} catch (error) {
  console.warn(`⚠ Failed to copy to node_modules:`, error.message);
}

// Copy to /tmp/prisma-engines (Vercel serverless fallback)
if (fs.existsSync('/tmp')) {
  if (!fs.existsSync(tmpDir)) {
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch (error) {
      console.warn(`⚠ Could not create /tmp/prisma-engines:`, error.message);
    }
  }
  
  if (fs.existsSync(tmpDir)) {
    const tmpPath = path.join(tmpDir, rhelBinary);
    try {
      fs.copyFileSync(sourcePath, tmpPath);
      console.log(`✓ Copied to /tmp/prisma-engines`);
    } catch (error) {
      console.warn(`⚠ Failed to copy to /tmp:`, error.message);
    }
  }
}

console.log('Prisma runtime setup complete.');

