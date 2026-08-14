import { useEffect, useState, type ReactNode } from 'react'
import {
  disconnectEngine,
  fetchEngineByCode,
  fetchEngineLink,
  getStoredEngineCode,
  listEngineInstances,
  setAssignedInstance,
  storeEngineCode,
  type CodeEngine,
  type EngineInstance,
  type EngineLink
} from '../lib/engine'
import { supabase } from '../lib/supabase'
import type { ScriptEntry } from '../lib/types'
import PostingScreen from './PostingScreen'
import ScriptsScreen from './ScriptsScreen'
import ScriptCreatorScreen from './ScriptCreatorScreen'
import HistoryScreen from './HistoryScreen'
import {
  CloseIcon,
  CreatorIcon,
  FilmIcon,
  HistoryIcon,
  HomeIcon,
  MenuIcon,
  RocketIcon,
  ScriptIcon,
  SendIcon,
  SparklesIcon
} from './Icons'

type View = 'cards' | 'posting' | 'scripts' | 'creator' | 'history'

const VIEW_KEY = 'f3.view'
const NAV_OPEN_KEY = 'f3.navOpen'

function loadSavedView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'posting' || v === 'scripts' || v === 'creator' || v === 'history' ? v : 'cards'
  } catch {
    return 'cards'
  }
}

function loadNavOpen(): boolean {
  // Desktop default: open. Mobile starts closed (overridden by media query on first paint via state).
  try {
    const v = localStorage.getItem(NAV_OPEN_KEY)
    if (v === '0') return false
    if (v === '1') return true
  } catch {
    // ignore
  }
  return typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : true
}

const NAV: Array<{ id: View; label: string; icon: ReactNode }> = [
  { id: 'cards', label: 'Home', icon: <HomeIcon size={16} /> },
  { id: 'posting', label: 'Posting', icon: <SendIcon size={16} /> },
  { id: 'scripts', label: 'Scripts', icon: <ScriptIcon size={16} /> },
  { id: 'creator', label: 'Script Creator', icon: <CreatorIcon size={16} /> },
  { id: 'history', label: 'History', icon: <HistoryIcon size={16} /> }
]

const CARDS: Array<{
  id: string
  title: string
  desc: string
  icon: ReactNode
  enabled: boolean
}> = [
  {
    id: 'ai',
    title: 'AI Generation',
    desc: 'Mirror Reel, Halyxis, Reelzey & more — runs on your Fanciaga engine.',
    icon: <SparklesIcon size={22} />,
    enabled: false
  },
  {
    id: 'editing',
    title: 'Editing',
    desc: 'Spoofer, Cutter, Mixer, Overlay Captions — runs on your Fanciaga engine.',
    icon: <FilmIcon size={22} />,
    enabled: false
  },
  {
    id: 'posting',
    title: 'Posting',
    desc: 'Load a Script recorded by the Script Writter and replay it — with the IG Selector to swap accounts.',
    icon: <RocketIcon size={22} />,
    enabled: true
  }
]

export default function HomeScreen(props: {
  userId: string
  email: string
  onUnpaired: () => void
}): JSX.Element {
  const [view, setViewState] = useState<View>(loadSavedView)
  const [navOpen, setNavOpenState] = useState(loadNavOpen)
  const [link, setLink] = useState<EngineLink | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pickedScript, setPickedScript] = useState<ScriptEntry | null>(null)
  const [editingScript, setEditingScript] = useState<ScriptEntry | null>(null)
  const [instances, setInstances] = useState<EngineInstance[]>([])
  const [assignOpen, setAssignOpen] = useState(false)
  // Connected by engine code (guest mode) — the engine belongs to someone
  // else, so status comes from engine_instances instead of our engine_links.
  const [engineCode] = useState(getStoredEngineCode)
  const [codeEngine, setCodeEngine] = useState<CodeEngine | null>(null)

  function setView(v: View): void {
    if (v !== 'creator') setEditingScript(null)
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // storage unavailable
    }
    // On small screens, close the drawer after navigating.
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setNavOpen(false)
    }
  }

  function setNavOpen(open: boolean): void {
    setNavOpenState(open)
    try {
      localStorage.setItem(NAV_OPEN_KEY, open ? '1' : '0')
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    let alive = true
    const check = async (): Promise<void> => {
      if (engineCode) {
        // Guest mode — the other engine's presence row is all that matters.
        const eng = await fetchEngineByCode(engineCode).catch(() => null)
        if (!alive) return
        setCodeEngine(eng)
        return
      }
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
    // The engine heartbeats every second — check often so an open app is
    // always shown as online/available with barely any lag.
    const t = window.setInterval(() => void check(), 5_000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.userId])

  async function disconnect(): Promise<void> {
    if (engineCode) {
      // Guest mode — just forget the code; the host engine is untouched.
      storeEngineCode('')
      props.onUnpaired()
      return
    }
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

  const engineOnline = engineCode ? !!codeEngine?.online : !!link?.online
  const engineName = engineCode
    ? codeEngine?.name || `Engine ${engineCode}`
    : link?.engineName || 'Fanciaga app'
  const engineChecked = engineCode ? codeEngine !== null : link !== null

  const viewLabel = NAV.find((n) => n.id === view)?.label || 'Home'

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden">
      {/* Mobile backdrop when left nav is open */}
      {navOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Left sidebar — drawer on mobile, collapsible rail on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-white/10 bg-panel transition-transform duration-200 ease-out lg:static lg:z-0 lg:w-56 lg:shrink-0 lg:bg-white/[0.02] ${
          navOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'
        }`}
      >
        <div className="flex h-14 items-center gap-2.5 px-3 sm:h-16 sm:px-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/40 bg-panel shadow-glow">
            <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-sm font-bold text-transparent">
              F3
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate bg-gradient-to-r from-accent to-accent2 bg-clip-text text-[15px] font-semibold tracking-tight text-transparent">
              FANCIAGA 3
            </span>
            <span className="truncate text-[10px] text-gray-500">{props.email}</span>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-white/[0.06] hover:text-white lg:hidden"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                view === item.id
                  ? 'bg-accent/15 text-white'
                  : 'text-gray-400 hover:bg-white/[0.05] hover:text-gray-100'
              }`}
              onClick={() => {
                if (item.id === 'creator') setEditingScript(null)
                setView(item.id)
              }}
            >
              <span className="shrink-0 opacity-90">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 pb-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-[11px]">
            <div className="mb-1 flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${engineOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className="text-gray-300">Engine {engineOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
            <div className="truncate text-gray-600">{engineName}</div>
            {engineCode ? (
              <div className="mt-1.5 border-t border-white/[0.06] pt-1.5 text-gray-500">
                Connected by code <span className="font-mono text-accent">{engineCode}</span>
              </div>
            ) : (
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
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 border-t border-white/10 p-3">
          <button
            className="rounded-xl border border-red-500/30 px-3 py-2.5 text-sm text-red-300 transition-colors hover:bg-red-500/10"
            onClick={() => void disconnect()}
          >
            {engineCode ? 'Disconnect engine' : 'Disconnect Fanciaga app'}
          </button>
          <button
            className="rounded-xl px-3 py-2 text-xs text-gray-500 transition-colors hover:bg-white/[0.05] hover:text-gray-200"
            onClick={() => void supabase.auth.signOut()}
          >
            Sign out
          </button>
          <button
            type="button"
            className="mt-1 hidden items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-400 transition-colors hover:bg-white/[0.05] hover:text-gray-200 lg:flex"
            onClick={() => setNavOpen(false)}
          >
            Hide sidebar
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — always visible on mobile; also when nav is hidden on desktop */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 bg-white/[0.02] px-3 sm:px-4 lg:h-12">
          <button
            type="button"
            className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-white"
            onClick={() => setNavOpen(!navOpen)}
            aria-label={navOpen ? 'Hide navigation' : 'Show navigation'}
          >
            <MenuIcon size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-gray-100">{viewLabel}</div>
            <div className="truncate text-[10px] text-gray-500 lg:hidden">{props.email}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-1 text-[10px] text-gray-400">
            <span className={`h-1.5 w-1.5 rounded-full ${engineOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className="hidden sm:inline">{engineOnline ? 'Engine online' : 'Engine offline'}</span>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          {engineChecked && !engineOnline && (
            <div className="mx-auto mb-4 max-w-3xl rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {engineCode
                ? `The engine with code ${engineCode} looks offline — make sure that Fanciaga app is open and signed in.`
                : 'Your Fanciaga engine looks offline — open the desktop app and sign in so commands can run.'}
            </div>
          )}
          {notice && (
            <div className="mx-auto mb-4 flex max-w-3xl items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-gray-300">
              <span>{notice}</span>
              <button className="shrink-0 text-gray-500 hover:text-white" onClick={() => setNotice(null)}>
                <CloseIcon size={16} />
              </button>
            </div>
          )}

          {view === 'cards' ? (
            <div className="mx-auto max-w-3xl">
              <h1 className="text-lg font-semibold text-gray-100">What do you want to do?</h1>
              <p className="mt-1 text-sm text-gray-500">Everything runs on your connected Fanciaga engine.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
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
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        c.enabled ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-gray-400'
                      }`}
                    >
                      {c.icon}
                    </span>
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
              onEdit={(s) => {
                setEditingScript(s)
                setViewState('creator')
                try {
                  localStorage.setItem(VIEW_KEY, 'creator')
                } catch {
                  // storage unavailable
                }
                if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
                  setNavOpen(false)
                }
              }}
            />
          ) : view === 'creator' ? (
            <ScriptCreatorScreen
              userId={props.userId}
              editing={editingScript}
              onSaved={() => {
                setEditingScript(null)
                setView('scripts')
              }}
              onCancelEdit={() => {
                setEditingScript(null)
                setView('scripts')
              }}
            />
          ) : view === 'history' ? (
            <HistoryScreen userId={props.userId} />
          ) : (
            <PostingScreen
              key={pickedScript?.id || 'default'}
              userId={props.userId}
              engineOnline={engineOnline}
              initialScript={pickedScript}
            />
          )}
        </main>
      </div>

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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={props.onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-panel p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-100">Assign scripts to a Fanciaga app</h2>
          <button className="rounded-lg p-1.5 text-gray-500 hover:bg-white/[0.06] hover:text-white" onClick={props.onClose}>
            <CloseIcon size={18} />
          </button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-gray-500">
          Every Fanciaga app logged into this account shows its code in Settings → Account. Pick which one
          should run the scripts — the others will ignore them.
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
                <p className="flex flex-wrap items-center gap-2 text-sm text-gray-100">
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
              No Fanciaga apps found yet. Open the desktop app, sign in, and it will appear here within a few
              seconds.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
