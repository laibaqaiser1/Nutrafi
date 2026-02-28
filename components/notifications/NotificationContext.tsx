'use client'

import React, { createContext, useCallback, useContext, useState } from 'react'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface Notification {
  id: string
  message: string
  type: NotificationType
  duration?: number
  createdAt: number
}

interface NotificationContextValue {
  notifications: Notification[]
  show: (message: string, type?: NotificationType, duration?: number) => string
  dismiss: (id: string) => void
  success: (message: string, duration?: number) => string
  error: (message: string, duration?: number) => string
  info: (message: string, duration?: number) => string
  warning: (message: string, duration?: number) => string
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

const DEFAULT_DURATION = 8000

function generateId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const show = useCallback(
    (message: string, type: NotificationType = 'info', duration = DEFAULT_DURATION) => {
      const id = generateId()
      const createdAt = Date.now()
      setNotifications((prev) => [...prev, { id, message, type, duration, createdAt }])
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [dismiss]
  )

  const success = useCallback((message: string, duration?: number) => show(message, 'success', duration), [show])
  const error = useCallback((message: string, duration?: number) => show(message, 'error', duration), [show])
  const info = useCallback((message: string, duration?: number) => show(message, 'info', duration), [show])
  const warning = useCallback((message: string, duration?: number) => show(message, 'warning', duration), [show])

  const value: NotificationContextValue = {
    notifications,
    show,
    dismiss,
    success,
    error,
    info,
    warning,
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  )
}

function NotificationContainer() {
  const { notifications, dismiss } = useContext(NotificationContext)!
  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-full max-w-md sm:max-w-lg pointer-events-none"
      aria-live="polite"
      role="region"
      aria-label="Notifications"
    >
      <div className="flex flex-col gap-3 pointer-events-auto">
        {notifications.map((n) => (
          <Toast key={n.id} notification={n} onDismiss={dismiss} />
        ))}
      </div>
    </div>
  )
}

// White toast for all; theme green tick (success), red cross (error), others white toast with icon
const typeStyles: Record<NotificationType, { bg: string; border: string; icon: string; iconBg: string }> = {
  success: {
    bg: 'bg-white',
    border: 'border border-gray-300',
    icon: 'text-[#728d53]',
    iconBg: 'bg-[#728d53]/10',
  },
  error: {
    bg: 'bg-white',
    border: 'border border-gray-300',
    icon: 'text-red-600',
    iconBg: 'bg-red-50',
  },
  info: {
    bg: 'bg-white',
    border: 'border border-gray-300',
    icon: 'text-gray-600',
    iconBg: 'bg-gray-100',
  },
  warning: {
    bg: 'bg-white',
    border: 'border border-gray-300',
    icon: 'text-amber-600',
    iconBg: 'bg-amber-50',
  },
}

const typeIcons: Record<NotificationType, React.ReactNode> = {
  success: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
}

function Toast({
  notification,
  onDismiss,
}: {
  notification: Notification
  onDismiss: (id: string) => void
}) {
  const { id, message, type } = notification
  const styles = typeStyles[type]
  const icon = typeIcons[type]

  return (
    <div
      className={`rounded-lg ${styles.bg} ${styles.border} px-4 py-2.5 flex items-center gap-3 shadow-xl transition-all duration-200`}
    >
      <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${styles.iconBg} ${styles.icon}`}>
        {icon}
      </div>
      <p className="flex-1 text-sm font-medium text-gray-900 leading-snug">{message}</p>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        className="flex-shrink-0 p-1 rounded-md hover:bg-black/5 text-gray-500 hover:text-gray-700 transition-colors"
        aria-label="Dismiss notification"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext)
  if (!ctx) {
    throw new Error('useNotification must be used within NotificationProvider')
  }
  return ctx
}
