import { getServerSession } from '@/lib/auth-helpers'
import { redirect } from 'next/navigation'
import { sessionHasPermission } from '@/lib/permissions'
import { PK } from '@/lib/permission-keys'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session || !sessionHasPermission(session, PK.moduleSettings)) {
    redirect('/dashboard')
  }
  return <>{children}</>
}
