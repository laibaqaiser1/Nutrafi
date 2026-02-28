'use client'

import { useState } from 'react'
import Image from 'next/image'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f0f4e8] to-[#e8ede0] px-2 py-6 sm:px-4 lg:px-8 lg:py-12">
      <div className="w-full max-w-md space-y-4 lg:space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-2 lg:mb-4">
            <Image
              src="/nutrafi_logo.png"
              alt="Nutrafi Kitchen"
              width={56}
              height={56}
              className="h-14 w-auto lg:h-20 lg:w-20"
            />
          </div>
          <h2 className="text-xl lg:text-3xl font-bold tracking-tight text-nutrafi-dark">
            Nutrafi Kitchen
          </h2>
          <p className="mt-1 lg:mt-2 text-xs lg:text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>
        <form className="mt-4 lg:mt-8 space-y-3 lg:space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded bg-red-50 p-2 lg:p-4">
              <p className="text-xs lg:text-sm text-red-800">{error}</p>
            </div>
          )}
          <div className="-space-y-px rounded shadow-sm lg:rounded-md">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="relative block w-full rounded-t border-0 px-2 py-1.5 lg:px-3 lg:py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-nutrafi-primary"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="relative block w-full rounded-b border-0 px-2 py-1.5 lg:px-3 lg:py-2 text-sm text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-nutrafi-primary"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative flex w-full justify-center rounded bg-nutrafi-primary px-3 py-1.5 lg:py-2 text-sm font-semibold text-white hover:bg-nutrafi-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nutrafi-primary disabled:opacity-50 transition-colors shadow lg:rounded-md"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

