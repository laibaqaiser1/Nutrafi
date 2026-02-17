import { getServerSession } from '@/lib/auth-helpers'
import { redirect } from 'next/navigation'
import DashboardLayout from '@/components/layout/DashboardLayout'
import { SessionProvider } from '@/components/providers/SessionProvider'

export default async function DashboardLayoutWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession()

  if (!session) {
    redirect('/login')
  }

  return (
    <SessionProvider session={session}>
      <DashboardLayout>{children}</DashboardLayout>
    </SessionProvider>
  )
}

