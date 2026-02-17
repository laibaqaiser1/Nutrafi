// Initialize Prisma binary location before importing client
import './prisma-init'

import { PrismaClient } from './generated/prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

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
      // Check if it's a connection error
      if (
        error?.message?.includes('Closed') ||
        error?.message?.includes('connection') ||
        error?.code === 'P1001' ||
        error?.code === 'P1008'
      ) {
        if (i < maxRetries - 1) {
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)))
          continue
        }
      }
      // If it's not a connection error or we've exhausted retries, throw
      throw error
    }
  }
  throw lastError
}

