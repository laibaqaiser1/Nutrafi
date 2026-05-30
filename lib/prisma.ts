// Initialize Prisma binary location before importing client
import './prisma-init'

import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from './generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
  /** mtime of generated client (dev only) — when `prisma generate` runs, recreate client */
  prismaGeneratedMtime?: number
}

function makeClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

const CHECK_INTERVAL_MS = 750
let lastDevStampCheck = 0

function getClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return (globalForPrisma.prisma ??= makeClient())
  }

  try {
    const now = Date.now()
    if (now - lastDevStampCheck >= CHECK_INTERVAL_MS) {
      lastDevStampCheck = now
      const generatedClassTs = path.join(
        process.cwd(),
        'lib/generated/prisma/internal/class.ts'
      )
      if (fs.existsSync(generatedClassTs)) {
        const mtime = fs.statSync(generatedClassTs).mtimeMs
        const prev = globalForPrisma.prismaGeneratedMtime
        if (
          globalForPrisma.prisma &&
          prev !== undefined &&
          prev !== mtime
        ) {
          void globalForPrisma.prisma.$disconnect().catch(() => {})
          globalForPrisma.prisma = undefined
        }
        globalForPrisma.prismaGeneratedMtime = mtime
      }
    }
  } catch {
    // ignore (e.g. unexpected fs / cwd)
  }

  return (globalForPrisma.prisma ??= makeClient())
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value
  },
}) as PrismaClient

// Helper function to retry database operations on connection errors
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | unknown
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation()
    } catch (error: any) {
      lastError = error
      if (
        error?.message?.includes('Closed') ||
        error?.message?.includes('connection') ||
        error?.message?.includes('Transaction not found') ||
        error?.code === 'P1001' ||
        error?.code === 'P1008' ||
        error?.code === 'P2024' ||
        error?.code === 'P2028'
      ) {
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)))
          continue
        }
      }
      throw error
    }
  }
  throw lastError
}
