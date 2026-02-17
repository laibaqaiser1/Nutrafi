const fs = require('fs');
const path = require('path');

// This script ensures Prisma binaries are accessible in multiple locations
// Prisma looks for binaries in:
// 1. __dirname (same directory as client.ts) - lib/generated/prisma/
// 2. process.cwd() + "lib/generated/prisma/"
// 3. node_modules/.prisma/client/ (fallback)

const sourceDir = path.join(__dirname, '../lib/generated/prisma');
const nodeModulesDir = path.join(__dirname, '../node_modules/.prisma/client');

const binaries = [
  'libquery_engine-rhel-openssl-3.0.x.so.node',
  'libquery_engine-debian-openssl-3.0.x.so.node'
];

// Check for required RHEL binary
const rhelBinary = 'libquery_engine-rhel-openssl-3.0.x.so.node';
const rhelPath = path.join(sourceDir, rhelBinary);
if (!fs.existsSync(rhelPath)) {
  console.error(`✗ Required binary not found: ${rhelPath}`);
  process.exit(1);
}
console.log(`✓ Found required binary: ${rhelBinary}`);

// Check for optional debian binary
const debianBinary = 'libquery_engine-debian-openssl-3.0.x.so.node';
const debianPath = path.join(sourceDir, debianBinary);
if (fs.existsSync(debianPath)) {
  console.log(`✓ Found optional binary: ${debianBinary}`);
} else {
  console.log(`⊘ Optional binary not found: ${debianBinary} (OK if not needed)`);
}

// Copy to node_modules/.prisma/client (fallback location for Vercel)
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
      console.warn(`⚠ Failed to copy ${binary}:`, error.message);
    }
  }
});

console.log('Prisma binaries setup complete.');

