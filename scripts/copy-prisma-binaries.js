const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../lib/generated/prisma');
const binaries = [
  'libquery_engine-rhel-openssl-3.0.x.so.node',
  'libquery_engine-debian-openssl-3.0.x.so.node'
];

// Check if binaries exist in source
binaries.forEach(binary => {
  const sourcePath = path.join(sourceDir, binary);
  if (fs.existsSync(sourcePath)) {
    console.log(`✓ Found ${binary}`);
  } else {
    console.error(`✗ Missing ${binary}`);
  }
});

console.log('Prisma binaries check complete.');


