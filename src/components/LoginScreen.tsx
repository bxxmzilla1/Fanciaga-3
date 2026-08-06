import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function LoginScreen(): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (err) setError(err.message)
    setBusy(false)
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-accent/40 bg-panel shadow-glow">
            <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-2xl font-bold text-transparent">
              F3
            </span>
          </div>
          <h1 className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-2xl font-bold tracking-tight text-transparent">
            FANCIAGA 3
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Sign in with your Fanciaga account to connect to your engine.
          </p>
        </div>

        <form onSubmit={(e) => void signIn(e)} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            className="rounded-2xl border border-white/10 bg-panel px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-accent/60"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            className="rounded-2xl border border-white/10 bg-panel px-4 py-3 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-accent/60"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.01] disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-gray-600">
          Use the same email &amp; password as your Fanciaga desktop app. The app must be open and
          signed in for the engine to show as ONLINE.
        </p>
      </div>
    </div>
  )
}
