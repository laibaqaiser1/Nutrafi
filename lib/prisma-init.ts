// Runtime initialization for Prisma binary in serverless environments
// This runs before Prisma Client is imported
// Uses PRISMA_QUERY_ENGINE_LIBRARY environment variable to tell Prisma where to find the binary

import * as fs from 'fs'
import * as path from 'path'

if (typeof process !== 'undefined') {
  const rhelBinary = 'libquery_engine-rhel-openssl-3.0.x.so.node'
  
  // Only set up binary path if not already set
  if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
    // Try to find the binary in common locations
    const possibleLocations = [
      // Vercel deployment locations (checked first for production)
      '/var/task/lib/generated/prisma/' + rhelBinary,
      '/var/task/node_modules/.prisma/client/' + rhelBinary,
      '/vercel/path0/lib/generated/prisma/' + rhelBinary,
      // Local development / build locations
      path.join(process.cwd(), 'lib/generated/prisma', rhelBinary),
      path.join(process.cwd(), 'node_modules/.prisma/client', rhelBinary),
      path.join(__dirname, 'generated/prisma', rhelBinary),
    ]
    
    let binaryPath: string | null = null
    for (const location of possibleLocations) {
      try {
        if (fs.existsSync(location)) {
          binaryPath = location
          break
        }
      } catch {
        // Continue searching
      }
    }
    
    // If found, set the environment variable
    if (binaryPath) {
      process.env.PRISMA_QUERY_ENGINE_LIBRARY = binaryPath
      console.log(`[Prisma] Found binary at: ${binaryPath}`)
    } else {
      // Fallback: try to copy to /tmp and use that
      const tmpDir = '/tmp/prisma-engines'
      const tmpPath = path.join(tmpDir, rhelBinary)
      
      // Try to find source to copy
      const sourceLocations = [
        path.join(process.cwd(), 'lib/generated/prisma', rhelBinary),
        path.join(process.cwd(), 'node_modules/.prisma/client', rhelBinary),
      ]
      
      for (const src of sourceLocations) {
        try {
          if (fs.existsSync(src)) {
            if (!fs.existsSync(tmpDir)) {
              fs.mkdirSync(tmpDir, { recursive: true })
            }
            fs.copyFileSync(src, tmpPath)
            fs.chmodSync(tmpPath, 0o755)
            process.env.PRISMA_QUERY_ENGINE_LIBRARY = tmpPath
            console.log(`[Prisma] Copied binary to: ${tmpPath}`)
            break
          }
        } catch (error: any) {
          console.warn(`[Prisma] Failed to copy from ${src}:`, error.message)
        }
      }
      
      if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
        console.warn('[Prisma] Binary not found in any expected location')
      }
    }
  }
}

