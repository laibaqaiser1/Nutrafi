const fs = require('fs');
const path = require('path');

// Copy Prisma binaries to .next/server directory so they're available at runtime
const sourceDir = path.join(__dirname, '../lib/generated/prisma');
const nextServerDir = path.join(__dirname, '../.next/server/lib/generated/prisma');
const nextStandaloneDir = path.join(__dirname, '../.next/standalone/lib/generated/prisma');

const binaries = [
  'libquery_engine-rhel-openssl-3.0.x.so.node',
  'libquery_engine-debian-openssl-3.0.x.so.node'
];

function copyBinaries(source, target) {
  if (!fs.existsSync(source)) {
    console.log(`Source directory doesn't exist: ${source}`);
    return;
  }
  
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  
  binaries.forEach(binary => {
    const sourcePath = path.join(source, binary);
    const targetPath = path.join(target, binary);
    
    if (fs.existsSync(sourcePath)) {
      try {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✓ Copied ${binary} to ${target}`);
      } catch (error) {
        console.warn(`⚠ Failed to copy ${binary}:`, error.message);
      }
    }
  });
}

// Copy to .next/server (for standard Next.js builds)
if (fs.existsSync('.next/server')) {
  copyBinaries(sourceDir, nextServerDir);
}

// Copy to .next/standalone (for standalone builds)
if (fs.existsSync('.next/standalone')) {
  copyBinaries(sourceDir, nextStandaloneDir);
}

console.log('Prisma binaries copy complete.');

