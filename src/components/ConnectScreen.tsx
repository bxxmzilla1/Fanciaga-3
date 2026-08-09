import { useEffect, useRef, useState } from 'react'
import {
  fetchEngineByCode,
  fetchEngineLink,
  normalizeEngineCode,
  setPwaConnected,
  storeEngineCode,
  type EngineLink
} from '../lib/engine'
import { supabase } from '../lib/supabase'
import { CheckIcon } from './Icons'

// Searches for the user's Fanciaga desktop app (the engine) by watching its
// heartbeat. When it's ONLINE: pair (pwa_connected = true) and show a brief
// confirmation before entering the app.
//
// Alternative: connect to ANY engine with the short code from that app's
// Settings — no need to have this Fanciaga account logged into it.

const CONFIRM_SECONDS = 3

export default function ConnectScreen(props: {
  userId: string
  onConnected: () => void
}): JSX.Element {
  const [phase, setPhase] = useState<'searching' | 'confirming'>('searching')
  const [link, setLink] = useState<EngineLink | null>(null)
  const [checks, setChecks] = useState(0)
  const pairedRef = useRef(false)
  // Connect-by-code form.
  const [code, setCode] = useState('')
  const [codeBusy, setCodeBusy] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  async function connectByCode(): Promise<void> {
    const clean = normalizeEngineCode(code)
    if (!clean || codeBusy) return
    setCodeBusy(true)
    setCodeError(null)
    try {
      const eng = await fetchEngineByCode(clean)
      if (!eng) {
        setCodeError('No engine with that code was found — check the code shown in the Fanciaga app’s Settings.')
        return
      }
      if (!eng.online) {
        setCodeError(
          `That engine${eng.name ? ` (${eng.name})` : ''} is offline — open the Fanciaga app on that PC and try again.`
        )
        return
      }
      storeEngineCode(clean)
      pairedRef.current = true
      setPhase('confirming')
    } catch (e) {
      setCodeError(e instanceof Error ? e.message : 'Could not look that code up — try again.')
    } finally {
      setCodeBusy(false)
    }
  }

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
        storeEngineCode('') // normal pairing — drop any leftover guest code
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
        <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-emerald-400/60 bg-emerald-500/10 text-emerald-300">
          <CheckIcon size={36} />
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

      {/* Connect with an engine code — works even when this Fanciaga account
          is NOT logged into that desktop app. */}
      <div className="w-full max-w-sm">
        <div className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-widest text-gray-600">
          <span className="h-px flex-1 bg-white/10" />
          or use an engine code
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-panel px-3 py-2.5 text-center font-mono text-sm uppercase tracking-[0.25em] text-gray-100 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-gray-600 focus:border-accent/50 focus:outline-none"
            placeholder="e.g. 7QK-3DM"
            value={code}
            maxLength={8}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setCodeError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void connectByCode()
            }}
          />
          <button
            className="shrink-0 rounded-xl bg-gradient-to-r from-accent to-accent2 px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            disabled={codeBusy || normalizeEngineCode(code).length < 7}
            onClick={() => void connectByCode()}
          >
            {codeBusy ? 'Checking…' : 'Connect'}
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-600">
          The code is shown in that Fanciaga app’s Settings. Your account doesn’t need to be logged
          into it — your scripts run on that engine, queued one by one with everyone else’s.
        </p>
        {codeError && <p className="mt-2 text-xs text-red-300">{codeError}</p>}
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
