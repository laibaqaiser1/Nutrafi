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

// Ensure source binaries exist (RHEL is required for production, debian is optional)
binaries.forEach(binary => {
  const sourcePath = path.join(sourceDir, binary);
  if (fs.existsSync(sourcePath)) {
    console.log(`✓ Found ${binary}`);
  } else {
    // Only fail if RHEL binary is missing (required for production)
    if (binary.includes('rhel-openssl-3.0.x')) {
      console.error(`✗ Required binary not found: ${sourcePath}`);
      process.exit(1);
    } else {
      console.warn(`⚠ Optional binary not found: ${binary} (this is OK if not needed)`);
    }
  }
});

// Copy to node_modules/.prisma/client (fallback location)
if (!fs.existsSync(nodeModulesDir)) {
  fs.mkdirSync(nodeModulesDir, { recursive: true });
}

binaries.forEach(binary => {
  const sourcePath = path.join(sourceDir, binary);
  const targetPath = path.join(nodeModulesDir, binary);
  
  if (fs.existsSync(sourcePath)) {
    try {
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✓ Copied ${binary} to node_modules/.prisma/client`);
    } catch (error) {
      console.warn(`⚠ Failed to copy ${binary} to node_modules:`, error.message);
    }
  } else {
    console.log(`⊘ Skipping ${binary} (not found, may not be needed for this platform)`);
  }
});

// Verify required binary (RHEL) is in the client directory
const rhelBinary = 'libquery_engine-rhel-openssl-3.0.x.so.node';
const rhelPath = path.join(clientDir, rhelBinary);
if (fs.existsSync(rhelPath)) {
  console.log(`✓ Required binary (RHEL) exists in client directory`);
} else {
  console.error(`✗ Required binary (RHEL) missing in client directory`);
  process.exit(1);
}

console.log('Prisma binaries setup complete.');

