import { useEffect, useRef, useState } from 'react'
import { fetchEngineLink, setPwaConnected, type EngineLink } from '../lib/engine'
import { supabase } from '../lib/supabase'

// Searches for the user's Fanciaga desktop app (the engine) by watching its
// heartbeat. When it's ONLINE: pair (pwa_connected = true) and show a brief
// confirmation before entering the app.

const CONFIRM_SECONDS = 3

export default function ConnectScreen(props: {
  userId: string
  onConnected: () => void
}): JSX.Element {
  const [phase, setPhase] = useState<'searching' | 'confirming'>('searching')
  const [link, setLink] = useState<EngineLink | null>(null)
  const [checks, setChecks] = useState(0)
  const pairedRef = useRef(false)

  // Poll the engine heartbeat until it's ONLINE.
  useEffect(() => {
    if (phase !== 'searching') return
    let alive = true
    const check = async (): Promise<void> => {
      const l = await fetchEngineLink(props.userId).catch(() => null)
      if (!alive) return
      setLink(l)
      setChecks((n) => n + 1)
      if (l?.online && !pairedRef.current) {
        pairedRef.current = true
        void setPwaConnected(props.userId, true)
        setPhase('confirming')
      }
    }
    void check()
    const t = window.setInterval(() => void check(), 3_000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [phase, props.userId])

  // Brief confirmation, then enter the app.
  useEffect(() => {
    if (phase !== 'confirming') return
    const t = window.setTimeout(props.onConnected, CONFIRM_SECONDS * 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  if (phase === 'confirming') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-400/60 bg-emerald-500/10 text-4xl text-emerald-300">
          ✓
        </div>
        <h1 className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-3xl font-extrabold tracking-widest text-transparent sm:text-5xl">
          ENGINE ONLINE
        </h1>
        <p className="text-sm text-gray-400">Fanciaga app connected.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 p-6 text-center">
      {/* Radar animation */}
      <div className="relative flex h-40 w-40 items-center justify-center">
        <span className="radar-ring absolute h-full w-full rounded-full border-2 border-accent/50" />
        <span className="radar-ring absolute h-full w-full rounded-full border-2 border-accent2/40 [animation-delay:.5s]" />
        <span className="radar-ring absolute h-full w-full rounded-full border-2 border-accent/30 [animation-delay:1s]" />
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-accent/40 bg-panel shadow-glow">
          <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-xl font-bold text-transparent">
            F3
          </span>
        </div>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-gray-100">Looking for your Fanciaga app…</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-gray-500">
          Open the Fanciaga desktop app and sign in with this same account — it becomes your engine
          and will show up here as ONLINE.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-panel px-4 py-2 text-xs">
          <span className={`h-2 w-2 rounded-full ${link?.online ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
          {link === null
            ? checks === 0
              ? 'Checking…'
              : 'No engine seen yet'
            : link.online
              ? `ONLINE — ${link.engineName || 'Fanciaga engine'}`
              : `Last seen ${link.onlineAt ? new Date(link.onlineAt).toLocaleString() : 'never'}${link.engineName ? ` on ${link.engineName}` : ''}`}
        </div>
      </div>

      <button
        className="text-xs text-gray-600 underline-offset-2 hover:text-gray-400 hover:underline"
        onClick={() => void supabase.auth.signOut()}
      >
        Sign out
      </button>
    </div>
  )
}
