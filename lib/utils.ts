import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format category for display
export function formatCategory(category: string): string {
  const categoryMap: { [key: string]: string } = {
    BREAKFAST: 'Breakfast',
    LUNCH: 'Lunch',
    DINNER: 'Dinner',
    LUNCH_DINNER: 'Lunch/Dinner',
    SNACK: 'Snack',
    SMOOTHIE: 'Smoothie',
    JUICE: 'Juice',
  }
  return categoryMap[category] || category
}

export function requireAuth() {
  // This will be used in middleware or route handlers
  return true
}

export function hasPermission(userRole: string, requiredRole: string[]): boolean {
  const roleHierarchy: Record<string, number> = {
    CHEF: 1,
    MANAGER: 2,
    ADMIN: 3,
  }
  
  const userLevel = roleHierarchy[userRole] || 0
  const requiredLevel = Math.max(...requiredRole.map(r => roleHierarchy[r] || 0))
  
  return userLevel >= requiredLevel
}

