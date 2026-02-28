import { UserRole } from '@/lib/generated/prisma/client'
import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: number
      email: string
      name: string
      role: UserRole
    }
  }

  interface User {
    id: number
    role: UserRole
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: UserRole
    id: number
  }
}

