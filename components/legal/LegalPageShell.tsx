import Image from 'next/image'
import Link from 'next/link'

interface LegalPageShellProps {
  title: string
  lastUpdated: string
  children: React.ReactNode
}

export function LegalPageShell({ title, lastUpdated, children }: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f4e8] to-[#e8ede0] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <Link href="/login" className="inline-flex flex-col items-center gap-2">
            <Image
              src="/nutrafi_logo.png"
              alt="Nutrafi Kitchen"
              width={48}
              height={48}
              className="h-12 w-auto"
            />
            <span className="text-lg font-bold text-nutrafi-dark">Nutrafi Kitchen</span>
          </Link>
        </header>

        <article className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
          <h1 className="text-2xl font-bold text-nutrafi-dark sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: {lastUpdated}</p>
          <div className="mt-8 space-y-6 text-gray-700 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-nutrafi-dark [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_a]:text-nutrafi-primary [&_a]:underline [&_a]:underline-offset-2">
            {children}
          </div>
        </article>

        <footer className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-gray-600">
          <Link href="/privacy" className="hover:text-nutrafi-primary hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-nutrafi-primary hover:underline">
            Terms of Service
          </Link>
          <Link href="/login" className="hover:text-nutrafi-primary hover:underline">
            Staff login
          </Link>
        </footer>
      </div>
    </div>
  )
}
