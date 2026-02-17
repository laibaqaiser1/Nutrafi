// Runtime initialization for Prisma binary in serverless environments
// This runs before Prisma Client is imported

import * as fs from 'fs'
import * as path from 'path'

if (typeof process !== 'undefined') {
  const rhelBinary = 'libquery_engine-rhel-openssl-3.0.x.so.node'
  const tmpDir = '/tmp/prisma-engines'
  const tmpPath = path.join(tmpDir, rhelBinary)
  
  // Only run in production/serverless environments
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    // Check if binary already exists in /tmp
    if (!fs.existsSync(tmpPath)) {
      // Try to find source binary
      const possibleSources = [
        path.join(process.cwd(), 'lib/generated/prisma', rhelBinary),
        path.join(process.cwd(), 'node_modules/.prisma/client', rhelBinary),
        '/var/task/lib/generated/prisma/' + rhelBinary,
        '/var/task/node_modules/.prisma/client/' + rhelBinary,
        path.join(__dirname, 'generated/prisma', rhelBinary),
      ]
      
      let sourcePath: string | null = null
      for (const src of possibleSources) {
        try {
          if (fs.existsSync(src)) {
            sourcePath = src
            break
          }
        } catch {
          // Continue searching
        }
      }
      
      // Copy to /tmp if found
      if (sourcePath) {
        try {
          if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true })
          }
          fs.copyFileSync(sourcePath, tmpPath)
          fs.chmodSync(tmpPath, 0o755)
          console.log(`[Prisma] Copied binary to ${tmpPath}`)
        } catch (error: any) {
          console.warn(`[Prisma] Failed to copy binary:`, error.message)
        }
      } else {
        console.warn('[Prisma] Binary not found in any expected location')
      }
    }
  }
}

