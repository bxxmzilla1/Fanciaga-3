import { useEffect, useState } from 'react'
import {
  disconnectEngine,
  fetchEngineLink,
  listEngineInstances,
  setAssignedInstance,
  type EngineInstance,
  type EngineLink
} from '../lib/engine'
import { supabase } from '../lib/supabase'
import type { ScriptEntry } from '../lib/types'
import PostingScreen from './PostingScreen'
import ScriptsScreen from './ScriptsScreen'

type View = 'cards' | 'posting' | 'scripts'

// Remember which section is open across browser refreshes.
const VIEW_KEY = 'f3.view'

function loadSavedView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'posting' || v === 'scripts' ? v : 'cards'
  } catch {
    return 'cards'
  }
}

const CARDS: Array<{ id: string; title: string; desc: string; emoji: string; enabled: boolean }> = [
  {
    id: 'ai',
    title: 'AI Generation',
    desc: 'Mirror Reel, Halyxis, Reelzey & more — runs on your Fanciaga engine.',
    emoji: '✨',
    enabled: false
  },
  {
    id: 'editing',
    title: 'Editing',
    desc: 'Spoofer, Cutter, Mixer, Overlay Captions — runs on your Fanciaga engine.',
    emoji: '🎬',
    enabled: false
  },
  {
    id: 'posting',
    title: 'Posting',
    desc: 'Load a Script recorded by the Script Writter and replay it — with the IG Selector to swap accounts.',
    emoji: '🚀',
    enabled: true
  }
]

export default function HomeScreen(props: {
  userId: string
  email: string
  onUnpaired: () => void
}): JSX.Element {
  const [view, setViewState] = useState<View>(loadSavedView)
  const [link, setLink] = useState<EngineLink | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // A script picked in the Scripts section, preloaded into Posting.
  const [pickedScript, setPickedScript] = useState<ScriptEntry | null>(null)
  // Every Fanciaga app logged into this account (for the script assigner).
  const [instances, setInstances] = useState<EngineInstance[]>([])
  const [assignOpen, setAssignOpen] = useState(false)

  function setView(v: View): void {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // storage unavailable — session-only persistence
    }
  }

  // Keep an eye on the engine: offline banner + honor a desktop-side disconnect.
  useEffect(() => {
    let alive = true
    const check = async (): Promise<void> => {
      const [l, inst] = await Promise.all([
        fetchEngineLink(props.userId).catch(() => null),
        listEngineInstances(props.userId).catch(() => [] as EngineInstance[])
      ])
      if (!alive) return
      setLink(l)
      setInstances(inst)
      if (l && !l.pwaConnected) props.onUnpaired()
    }
    void check()
    const t = window.setInterval(() => void check(), 10_000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.userId])

  async function disconnect(): Promise<void> {
    await disconnectEngine(props.userId)
    props.onUnpaired()
  }

  async function assign(instanceId: string): Promise<void> {
    try {
      await setAssignedInstance(props.userId, instanceId)
      setLink((prev) => (prev ? { ...prev, assignedInstance: instanceId } : prev))
      setAssignOpen(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not save the engine assignment.')
    }
  }

  const assignedInstance = link?.assignedInstance || ''
  const assignedInfo = assignedInstance
    ? instances.find((i) => i.instanceId === assignedInstance) || null
    : null

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-white/[0.02]">
        <div className="flex h-16 items-center gap-2.5 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent/40 bg-panel shadow-glow">
            <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-sm font-bold text-transparent">
              F3
            </span>
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate bg-gradient-to-r from-accent to-accent2 bg-clip-text text-[15px] font-semibold tracking-tight text-transparent">
              FANCIAGA 3
            </span>
            <span className="truncate text-[10px] text-gray-500">{props.email}</span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
          <button
            className={`rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
              view === 'cards' ? 'bg-accent/15 text-white' : 'text-gray-400 hover:bg-white/[0.05] hover:text-gray-100'
            }`}
            onClick={() => setView('cards')}
          >
            Home
          </button>
          <button
            className={`rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
              view === 'posting' ? 'bg-accent/15 text-white' : 'text-gray-400 hover:bg-white/[0.05] hover:text-gray-100'
            }`}
            onClick={() => setView('posting')}
          >
            Posting
          </button>
          <button
            className={`rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
              view === 'scripts' ? 'bg-accent/15 text-white' : 'text-gray-400 hover:bg-white/[0.05] hover:text-gray-100'
            }`}
            onClick={() => setView('scripts')}
          >
            Scripts
          </button>
        </nav>

        {/* Engine status */}
        <div className="px-3 pb-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px]">
            <div className="mb-1 flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${link?.online ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className="text-gray-300">Engine {link?.online ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
            <div className="truncate text-gray-600">{link?.engineName || 'Fanciaga app'}</div>
            {/* Which Fanciaga app runs the scripts (assigner) */}
            <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1.5">
              <span className="truncate text-gray-500">
                Scripts:{' '}
                {assignedInstance ? (
                  <span className="font-mono text-accent">
                    {assignedInfo?.code || assignedInstance.slice(0, 7)}
                  </span>
                ) : (
                  <span className="text-gray-400">any online app</span>
                )}
              </span>
              <button
                className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-300 transition-colors hover:bg-white/[0.12] hover:text-white"
                onClick={() => setAssignOpen(true)}
              >
                Assign
              </button>
            </div>
          </div>
        </div>

        {/* Disconnect + sign out */}
        <div className="flex flex-col gap-1 border-t border-white/10 p-3">
          <button
            className="rounded-xl border border-red-500/30 px-3 py-2.5 text-sm text-red-300 transition-colors hover:bg-red-500/10"
            onClick={() => void disconnect()}
          >
            Disconnect Fanciaga app
          </button>
          <button
            className="rounded-xl px-3 py-2 text-xs text-gray-500 transition-colors hover:bg-white/[0.05] hover:text-gray-200"
            onClick={() => void supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        {link && !link.online && (
          <div className="mx-auto mb-4 max-w-3xl rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Your Fanciaga engine looks offline — open the desktop app and sign in so commands can run.
          </div>
        )}
        {notice && (
          <div className="mx-auto mb-4 flex max-w-3xl items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-300">
            <span>{notice}</span>
            <button className="shrink-0 text-gray-500 hover:text-white" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        {view === 'cards' ? (
          <div className="mx-auto max-w-3xl">
            <h1 className="text-lg font-semibold text-gray-100">What do you want to do?</h1>
            <p className="mt-1 text-sm text-gray-500">
              Everything runs on your connected Fanciaga engine.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {CARDS.map((c) => (
                <button
                  key={c.id}
                  className={`group flex flex-col items-start gap-3 rounded-3xl border p-5 text-left transition-all ${
                    c.enabled
                      ? 'border-accent/30 bg-panel hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-glow'
                      : 'border-white/10 bg-white/[0.02] opacity-70 hover:opacity-90'
                  }`}
                  onClick={() => {
                    if (c.enabled) setView('posting')
                    else setNotice(`${c.title} runs on your Fanciaga engine — coming to Fanciaga 3 soon.`)
                  }}
                >
                  <span className="text-3xl">{c.emoji}</span>
                  <span className="text-sm font-semibold text-gray-100">{c.title}</span>
                  <span className="text-xs leading-relaxed text-gray-500">{c.desc}</span>
                  {!c.enabled && (
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-gray-500">
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : view === 'scripts' ? (
          <ScriptsScreen
            userId={props.userId}
            onUseInPosting={(s) => {
              setPickedScript(s)
              setView('posting')
            }}
          />
        ) : (
          <PostingScreen
            key={pickedScript?.id || 'default'}
            userId={props.userId}
            engineOnline={!!link?.online}
            initialScript={pickedScript}
          />
        )}
      </main>

      {assignOpen && (
        <EngineAssignerModal
          instances={instances}
          assignedInstance={assignedInstance}
          onAssign={(id) => void assign(id)}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </div>
  )
}

/**
 * Assigner — pick which Fanciaga app runs this account's scripts when several
 * apps are logged in at once. Each app shows its code in Settings so you can
 * match the list below to the right PC.
 */
function EngineAssignerModal(props: {
  instances: EngineInstance[]
  assignedInstance: string
  onAssign: (instanceId: string) => void
  onClose: () => void
}): JSX.Element {
  const { instances, assignedInstance } = props

  function lastSeen(i: EngineInstance): string {
    if (i.online) return 'Online now'
    if (!i.onlineAt) return 'Never seen online'
    return `Last seen ${new Date(i.onlineAt).toLocaleString()}`
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={props.onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-panel p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-100">Assign scripts to a Fanciaga app</h2>
          <button className="text-gray-500 hover:text-white" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-gray-500">
          Every Fanciaga app logged into this account shows its code in Settings → Account. Pick which
          one should run the scripts — the others will ignore them.
        </p>

        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          <button
            className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
              !assignedInstance
                ? 'border-accent/50 bg-accent/10'
                : 'border-white/10 bg-white/[0.02] hover:border-white/25'
            }`}
            onClick={() => props.onAssign('')}
          >
            <div>
              <p className="text-sm text-gray-100">Any online app</p>
              <p className="text-[11px] text-gray-500">First Fanciaga app to respond runs the script.</p>
            </div>
            {!assignedInstance && <span className="text-[10px] font-semibold text-accent">ASSIGNED</span>}
          </button>

          {instances.map((i) => (
            <button
              key={i.instanceId}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                assignedInstance === i.instanceId
                  ? 'border-accent/50 bg-accent/10'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/25'
              }`}
              onClick={() => props.onAssign(i.instanceId)}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm text-gray-100">
                  <span className="font-mono font-semibold tracking-widest text-accent">
                    {i.code || i.instanceId.slice(0, 7)}
                  </span>
                  <span className="truncate text-gray-400">{i.name || 'Fanciaga app'}</span>
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${i.online ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {lastSeen(i)}
                </p>
              </div>
              {assignedInstance === i.instanceId && (
                <span className="shrink-0 text-[10px] font-semibold text-accent">ASSIGNED</span>
              )}
            </button>
          ))}

          {instances.length === 0 && (
            <p className="rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-4 text-center text-xs text-gray-500">
              No Fanciaga apps found yet. Open the desktop app, sign in, and it will appear here within a
              few seconds. (Make sure the latest database schema is applied.)
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
