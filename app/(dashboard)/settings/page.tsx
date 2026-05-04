import Link from 'next/link'

const modules: { title: string; description: string; href: string }[] = [
  {
    title: 'Users',
    description: 'Create accounts and assign a role.',
    href: '/settings/users',
  },
  {
    title: 'Role access',
    description: 'Choose which permissions each role has.',
    href: '/settings/permissions',
  },
]

export default function SettingsPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">Configure workspace options.</p>

      <ul className="mt-8 space-y-3">
        {modules.map((m) => (
          <li key={m.href}>
            <Link
              href={m.href}
              className="group flex items-start gap-4 rounded-xl border border-[#e8ede0] bg-white p-5 shadow-sm transition hover:border-nutrafi-primary/40 hover:shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#f0f4e8] text-nutrafi-dark group-hover:bg-nutrafi-primary/15">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-gray-900 group-hover:text-nutrafi-dark">{m.title}</span>
                <span className="mt-1 block text-sm text-gray-500">{m.description}</span>
              </span>
              <span className="shrink-0 text-gray-400 transition group-hover:text-nutrafi-primary" aria-hidden>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
