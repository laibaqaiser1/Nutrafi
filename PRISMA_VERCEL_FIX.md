# Prisma Binary Issue on Vercel - Troubleshooting Guide

## Problem
Prisma Client cannot locate the Query Engine binary for "rhel-openssl-3.0.x" in Vercel serverless functions.

## Root Cause
Using a custom Prisma output path (`lib/generated/prisma`) makes it difficult for Vercel's file tracing to include the binary files in the deployment package.

## Current Configuration
- Custom output: `lib/generated/prisma`
- Binary targets: `["native", "rhel-openssl-3.0.x"]`
- Scripts run: `ensure-prisma-binaries.js`, `setup-prisma-runtime.js`, `copy-prisma-to-next.js`

## Solutions Tried
1. ✅ Added `binaryTargets` for RHEL support
2. ✅ Created scripts to copy binaries to multiple locations
3. ✅ Added `outputFileTracingIncludes` in `next.config.ts`
4. ✅ Added `includeFiles` in `vercel.json`
5. ✅ Copied binaries to `node_modules/.prisma/client`

## Recommended Solution

### Option 1: Use Prisma's Default Output (Recommended)
Change the Prisma schema to use the default output location:

```prisma
generator client {
  provider      = "prisma-client"
  // Remove: output = "../lib/generated/prisma"
  binaryTargets = ["native", "rhel-openssl-3.0.x"]
}
```

Then update all imports:
- `lib/prisma.ts`: `import { PrismaClient } from '@prisma/client'`
- `lib/auth.ts`: `import { UserRole } from '@prisma/client'`
- `types/next-auth.d.ts`: `import { UserRole } from '@prisma/client'`
- `scripts/seed-admin.ts`: `import { PrismaClient } from '@prisma/client'`

This is the most reliable solution as Vercel handles the default location automatically.

### Option 2: Verify Build Logs
Check Vercel build logs to confirm:
1. `prisma generate` runs successfully
2. Binaries are created in `lib/generated/prisma/`
3. Scripts copy binaries successfully
4. Files are included in the deployment package

### Option 3: Use Environment Variable
Set `PRISMA_QUERY_ENGINE_LIBRARY` in Vercel environment variables to point to the binary location.

## Next Steps
1. Check Vercel build logs for any errors during binary copying
2. Verify the binary file size (should be ~17MB)
3. Consider switching to default Prisma output location for better Vercel compatibility

