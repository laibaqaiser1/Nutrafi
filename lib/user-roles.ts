/** All Prisma `UserRole` values — use for admin dropdowns and APIs. */
export const ALL_USER_ROLES = ['ADMIN', 'MANAGER', 'CHEF', 'OPERATIONS'] as const

export type AllUserRole = (typeof ALL_USER_ROLES)[number]
