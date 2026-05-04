import { UserRole } from '@/lib/generated/prisma/client'
import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: number
      email: string
      name: string
      role: UserRole
      /** Loaded from `RolePermission` for the user’s role (refreshed each session). */
      permissionKeys: string[]
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

