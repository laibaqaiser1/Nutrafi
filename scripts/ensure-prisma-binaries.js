const fs = require('fs');
const path = require('path');

// This script ensures Prisma binaries are accessible in multiple locations
// Prisma looks for binaries in:
// 1. __dirname (same directory as client.ts)
// 2. process.cwd() + "lib/generated/prisma/"

const sourceDir = path.join(__dirname, '../lib/generated/prisma');
const clientDir = sourceDir; // Same directory as client.ts
const nodeModulesDir = path.join(__dirname, '../node_modules/.prisma/client');

const binaries = [
  'libquery_engine-rhel-openssl-3.0.x.so.node',
  'libquery_engine-debian-openssl-3.0.x.so.node'
];

// Ensure source binaries exist
binaries.forEach(binary => {
  const sourcePath = path.join(sourceDir, binary);
  if (!fs.existsSync(sourcePath)) {
    console.error(`✗ Source file not found: ${sourcePath}`);
    process.exit(1);
  }
  console.log(`✓ Found ${binary}`);
});

// Copy to node_modules/.prisma/client (fallback location)
if (!fs.existsSync(nodeModulesDir)) {
  fs.mkdirSync(nodeModulesDir, { recursive: true });
}

binaries.forEach(binary => {
  const sourcePath = path.join(sourceDir, binary);
  const targetPath = path.join(nodeModulesDir, binary);
  
  try {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`✓ Copied ${binary} to node_modules/.prisma/client`);
  } catch (error) {
    console.warn(`⚠ Failed to copy ${binary} to node_modules:`, error.message);
  }
});

// Verify binaries are in the client directory (they should already be there)
binaries.forEach(binary => {
  const clientPath = path.join(clientDir, binary);
  if (fs.existsSync(clientPath)) {
    console.log(`✓ Binary exists in client directory: ${binary}`);
  } else {
    console.error(`✗ Binary missing in client directory: ${binary}`);
  }
});

console.log('Prisma binaries setup complete.');

