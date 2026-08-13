import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listGroupVaultItems,
  listGroupVaultTabs,
  listMyGroups,
  signVaultItemUrl,
  type VaultGroup,
  type VaultItem,
  type VaultTab
} from '../lib/vaults'
import { videoHasNoPicture, UNPLAYABLE_VIDEO_MSG } from '../lib/preview'
import { saveScript } from '../lib/scripts'
import type { ScriptAccountRef, ScriptEntry } from '../lib/types'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  FilmIcon,
  FolderIcon,
  ImageIcon,
  PanelRightIcon,
  PlayIcon,
  RefreshIcon
} from './Icons'

// Script Creator — the Striker-style builder, right in Fanciaga 3. The group
// vault lives in a RIGHT SIDEBAR as a three-column thumbnail grid: tap a
// video to preview it inside the sidebar (the media is signed + loaded only
// then, and fully unloaded on exit so the site stays fast), or use "+ Add" to
// stack it into the script. Picking a thumbnail for a post switches the same
// sidebar to the vault's images.
//
// The saved script targets one "template" account: in Posting you
// multi-select the real Instagram accounts and each stacked run swaps the
// template for that account.

// The placeholder account the script is built against — every run replaces it.
const TEMPLATE_REF: ScriptAccountRef = {
  accountId: 'fanciaga3-template',
  keyId: 'fanciaga3-template',
  username: 'template'
}

interface CreatorSlot {
  key: string
  item: VaultItem
  /**
   * Wait BEFORE this post (ms) — after the previous post, or after the script
   * runs for the first slot. Same semantics as the Scripts Preview sidebar.
   */
  waitMs: number
  /** Optional image merged as a 0.5s intro before the video. */
  thumb: VaultItem | null
}

/** What the right sidebar is showing: the videos, or a thumbnail pick. */
type SidebarMode = { kind: 'videos' } | { kind: 'thumb'; slotKey: string; slotNumber: number }

// All times in the creator are RELATIVE waits between posts (days + hours +
// minutes) — no dates to pick. When the engine runs the script it anchors the
// whole batch at that moment, keeping every gap exactly as entered.

const DAY_MS = 24 * 60 * 60_000
const HOUR_MS = 60 * 60_000
const MIN_MS = 60_000

function msToDur(ms: number): { d: number; h: number; m: number } {
  const t = Math.max(0, Math.round(ms / MIN_MS) * MIN_MS)
  const d = Math.floor(t / DAY_MS)
  const h = Math.floor((t % DAY_MS) / HOUR_MS)
  const m = Math.round((t % HOUR_MS) / MIN_MS)
  return { d, h, m }
}

function fmtDur(ms: number): string {
  const { d, h, m } = msToDur(ms)
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  return parts.join(' ') || '0m'
}

/** "posts +2h 30m after run" — the cumulative offset shown next to each wait. */
function fmtOffset(cumulativeMs: number): string {
  if (cumulativeMs <= 0) return 'posts at run time'
  return `posts +${fmtDur(cumulativeMs)} after run`
}

/** Three little number boxes — days, hours, minutes — bound to a ms value. */
function DurInputs(props: {
  valueMs: number
  onChange: (ms: number) => void
  compact?: boolean
}): JSX.Element {
  const dur = msToDur(props.valueMs)
  const box = props.compact
    ? 'w-11 rounded-lg border border-white/10 bg-panel2 px-1 py-1 text-center text-[11px] text-gray-100 outline-none focus:border-accent/60 [color-scheme:dark]'
    : 'w-14 rounded-xl border border-white/10 bg-panel2 px-1.5 py-1.5 text-center text-xs text-gray-100 outline-none focus:border-accent/60 [color-scheme:dark]'
  const label = props.compact ? 'text-[9px] text-gray-600' : 'text-[10px] text-gray-500'
  const set = (part: 'd' | 'h' | 'm', raw: string): void => {
    const n = Math.max(0, Math.round(Number(raw) || 0))
    const next = { ...dur, [part]: part === 'd' ? Math.min(n, 365) : Math.min(n, part === 'h' ? 23 : 59) }
    props.onChange(next.d * DAY_MS + next.h * HOUR_MS + next.m * MIN_MS)
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input type="number" min={0} max={365} className={box} value={dur.d} onChange={(e) => set('d', e.target.value)} />
      <span className={label}>d</span>
      <input type="number" min={0} max={23} className={box} value={dur.h} onChange={(e) => set('h', e.target.value)} />
      <span className={label}>h</span>
      <input type="number" min={0} max={59} className={box} value={dur.m} onChange={(e) => set('m', e.target.value)} />
      <span className={label}>m</span>
    </span>
  )
}

function fmtDuration(s: number): string {
  if (!s || s <= 0) return ''
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function ScriptCreatorScreen(props: {
  userId: string
  onSaved: () => void
}): JSX.Element {
  const [name, setName] = useState('')
  const [groups, setGroups] = useState<VaultGroup[] | null>(null)
  const [groupId, setGroupId] = useState('')
  const [items, setItems] = useState<VaultItem[] | null>(null)
  const [tabs, setTabs] = useState<VaultTab[]>([])
  // '' = All, 'unsorted' = items filed into no tab, else a tab id.
  const [activeTab, setActiveTab] = useState('')
  const [itemsLoading, setItemsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slots, setSlots] = useState<CreatorSlot[]>([])
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>({ kind: 'videos' })
  // Right vault drawer — open by default on desktop, closed on small screens.
  const [vaultOpen, setVaultOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  )

  // Schedule helper: delay before the first post + gap between posts, both as
  // days/hours/minutes AFTER the script runs.
  const [firstOffsetMs, setFirstOffsetMs] = useState(10 * MIN_MS)
  const [gapMs, setGapMs] = useState(HOUR_MS)

  // Running total of the waits — "posts +2h after run" label per slot.
  const cumulativeOffsets = useMemo(() => {
    let t = 0
    return slots.map((s) => (t += Math.max(0, s.waitMs)))
  }, [slots])

  function openVaultMode(mode: SidebarMode): void {
    setSidebarMode(mode)
    setVaultOpen(true)
  }

  // The active tab filters BOTH grids: videos while browsing and images while
  // picking a thumbnail.
  const inTab = useMemo(() => {
    const list = items || []
    if (!activeTab) return list
    if (activeTab === 'unsorted') return list.filter((i) => !i.tabId)
    return list.filter((i) => i.tabId === activeTab)
  }, [items, activeTab])
  const videos = useMemo(() => inTab.filter((i) => i.kind === 'video'), [inTab])
  const images = useMemo(() => inTab.filter((i) => i.kind === 'image'), [inTab])
  const hasUnsorted = useMemo(() => (items || []).some((i) => !i.tabId), [items])

  useEffect(() => {
    void (async () => {
      try {
        const g = await listMyGroups()
        setGroups(g)
        if (g.length === 1) setGroupId(g[0].id)
      } catch (e) {
        setGroups([])
        setError(e instanceof Error ? e.message : 'Could not load your groups.')
      }
    })()
  }, [])

  async function loadItems(gid: string): Promise<void> {
    if (!gid) return
    setItemsLoading(true)
    setError(null)
    try {
      const [loadedItems, loadedTabs] = await Promise.all([
        listGroupVaultItems(gid),
        listGroupVaultTabs(gid).catch(() => [] as VaultTab[])
      ])
      setItems(loadedItems)
      setTabs(loadedTabs)
    } catch (e) {
      setItems(null)
      setTabs([])
      setError(e instanceof Error ? e.message : 'Could not load that group vault.')
    } finally {
      setItemsLoading(false)
    }
  }

  useEffect(() => {
    setSidebarMode({ kind: 'videos' })
    setActiveTab('')
    setTabs([])
    if (groupId) void loadItems(groupId)
    else setItems(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  function addVideo(item: VaultItem): void {
    setSavedMsg('')
    setSlots((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        item,
        waitMs: prev.length === 0 ? firstOffsetMs : Math.max(MIN_MS, gapMs),
        thumb: null
      }
    ])
  }

  function removeSlot(key: string): void {
    setSlots((prev) => prev.filter((s) => s.key !== key))
    setSidebarMode((m) => (m.kind === 'thumb' && m.slotKey === key ? { kind: 'videos' } : m))
  }

  function moveSlot(key: string, dir: -1 | 1): void {
    setSlots((prev) => {
      const i = prev.findIndex((s) => s.key === key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function setSlotThumb(slotKey: string, thumb: VaultItem | null): void {
    setSlots((prev) => prev.map((s) => (s.key === slotKey ? { ...s, thumb } : s)))
    setSidebarMode({ kind: 'videos' })
  }

  function applySchedule(): void {
    setError(null)
    const gap = Math.max(MIN_MS, gapMs)
    setSlots((prev) => prev.map((s, i) => ({ ...s, waitMs: i === 0 ? firstOffsetMs : gap })))
  }

  async function save(): Promise<void> {
    const clean = name.trim()
    if (!clean) {
      setError('Give the script a name first.')
      return
    }
    if (slots.length === 0) {
      setError('Add at least one video to the script.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // Slots post in list order — same shape the desktop Striker logs. The
      // per-post waits are summed into absolute times anchored at save; the
      // engine re-anchors the whole batch when the script actually runs, so
      // only the days/hours/minutes gaps entered here matter.
      const base = Date.now()
      let cumulative = 0
      const strikerSlots = slots.map((s, i) => {
        cumulative += Math.max(0, s.waitMs)
        return {
          accountId: TEMPLATE_REF.accountId,
          keyId: TEMPLATE_REF.keyId,
          slot: ((i % 3) + 1) as 1 | 2 | 3,
          source: 'group' as const,
          groupId: s.item.groupId,
          itemId: s.item.id,
          scheduledFor: new Date(base + cumulative).toISOString(),
          ...(s.thumb
            ? { thumbnail: { source: 'group' as const, groupId: s.thumb.groupId, itemId: s.thumb.id } }
            : {})
        }
      })
      const entry: ScriptEntry = {
        id: crypto.randomUUID(),
        name: clean,
        createdAt: Date.now(),
        actions: [
          {
            id: crypto.randomUUID(),
            at: Date.now(),
            type: 'striker_batch',
            summary: `Striker — ${strikerSlots.length} scheduled post${strikerSlots.length === 1 ? '' : 's'} (built in Fanciaga 3)`,
            input: { slots: strikerSlots },
            accounts: [TEMPLATE_REF]
          }
        ],
        accounts: [TEMPLATE_REF],
        replacements: {}
      }
      await saveScript(props.userId, entry)
      setSavedMsg(`Saved “${clean}” — it's now in your Scripts section.`)
      setName('')
      setSlots([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the script.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-start">
      {/* ── Left: script being built ─────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-100">Script Creator</h1>
            <p className="mt-1 text-sm text-gray-500">
              Build a Striker-style script from the group vault, set relative posting times, and save
              it into Scripts. Multi-select accounts in Posting to replace the template on every run.
            </p>
          </div>
          <button
            type="button"
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
              vaultOpen
                ? 'border-accent/40 bg-accent/15 text-accent'
                : 'border-white/10 text-gray-300 hover:bg-white/[0.05]'
            }`}
            onClick={() => setVaultOpen((o) => !o)}
          >
            <PanelRightIcon size={14} />
            {vaultOpen ? 'Hide vault' : 'Show vault'}
          </button>
        </div>

        {error && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <span>{error}</span>
            <button className="shrink-0 text-red-300/80 hover:text-white" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {savedMsg && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            <span>{savedMsg}</span>
            <button className="shrink-0 text-emerald-300/80 hover:text-white" onClick={props.onSaved}>
              Open Scripts →
            </button>
          </div>
        )}

        {/* Name + save */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <input
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-panel2 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-accent/60"
            placeholder="Script name (e.g. “Miami push — 9 videos”)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:opacity-50"
            disabled={saving || slots.length === 0 || !name.trim()}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : `Save script (${slots.length} post${slots.length === 1 ? '' : 's'})`}
          </button>
        </div>

        {/* Sequence (the script being built) */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-gray-100">
                Posting sequence{' '}
                {slots.length > 0 && <span className="text-gray-500">({slots.length})</span>}
              </div>
              <p className="mt-0.5 text-xs text-gray-500">
                Each time is the wait BEFORE that post — after the previous one (the first waits
                from the script run). Pick an optional thumbnail image per post.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-gray-500">First post after</label>
              <DurInputs valueMs={firstOffsetMs} onChange={setFirstOffsetMs} />
              <label className="text-[11px] text-gray-500">then every</label>
              <DurInputs valueMs={gapMs} onChange={setGapMs} />
              <button
                className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.05] disabled:opacity-50"
                disabled={slots.length === 0}
                onClick={applySchedule}
                title="Set every wait at once: the first post waits the delay, each next post waits the interval"
              >
                Apply times
              </button>
            </div>
          </div>

          {slots.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-xs text-gray-600">
              Use <span className="text-gray-400">+ Add</span> on the vault videos (right sidebar) to
              stack them here in posting order.
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {slots.map((s, i) => (
                <div
                  key={s.key}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2"
                >
                  <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 text-[10px] text-gray-500">
                    {i + 1}
                  </span>
                  <div className="h-14 w-9 shrink-0 overflow-hidden rounded-md bg-black/40">
                    {s.item.thumbUrl ? (
                      <img src={s.item.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-500">
                        <FilmIcon size={14} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-gray-200">{s.item.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] text-gray-500">
                        {i === 0 ? 'wait after run' : 'wait'}
                      </span>
                      <DurInputs
                        compact
                        valueMs={s.waitMs}
                        onChange={(ms) =>
                          setSlots((prev) =>
                            prev.map((x) => (x.key === s.key ? { ...x, waitMs: ms } : x))
                          )
                        }
                      />
                      <span className="text-[10px] text-gray-600">{fmtOffset(cumulativeOffsets[i])}</span>
                      <button
                        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                          sidebarMode.kind === 'thumb' && sidebarMode.slotKey === s.key
                            ? 'border-accent/60 bg-accent/15 text-accent'
                            : 'border-white/10 text-gray-300 hover:bg-white/[0.05]'
                        }`}
                        onClick={() =>
                          openVaultMode({ kind: 'thumb', slotKey: s.key, slotNumber: i + 1 })
                        }
                        title="Pick a thumbnail image from the vault (0.5s intro before the video)"
                      >
                        {s.thumb ? (
                          <>
                            {s.thumb.thumbUrl && (
                              <img src={s.thumb.thumbUrl} alt="" className="h-5 w-5 rounded object-cover" />
                            )}
                            <span className="max-w-24 truncate">{s.thumb.title}</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon size={12} />
                            <span>Thumbnail…</span>
                          </>
                        )}
                      </button>
                      {s.thumb && (
                        <button
                          className="rounded-lg p-1 text-gray-600 hover:text-red-300"
                          onClick={() => setSlotThumb(s.key, null)}
                          title="Remove the thumbnail"
                        >
                          <CloseIcon size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      className="rounded p-1 text-gray-500 hover:bg-white/10 hover:text-gray-200 disabled:opacity-30"
                      disabled={i === 0}
                      onClick={() => moveSlot(s.key, -1)}
                      title="Move up"
                    >
                      <ChevronUpIcon size={14} />
                    </button>
                    <button
                      className="rounded p-1 text-gray-500 hover:bg-white/10 hover:text-gray-200 disabled:opacity-30"
                      disabled={i === slots.length - 1}
                      onClick={() => moveSlot(s.key, 1)}
                      title="Move down"
                    >
                      <ChevronDownIcon size={14} />
                    </button>
                  </div>
                  <button
                    className="shrink-0 rounded-lg p-1.5 text-gray-600 hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => removeSlot(s.key)}
                    title="Remove this post"
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar: the group vault (drawer on mobile) ───────────── */}
      {vaultOpen && (
        <button
          type="button"
          aria-label="Close vault"
          className="fixed inset-0 z-40 bg-black/55 lg:hidden"
          onClick={() => setVaultOpen(false)}
        />
      )}
      <VaultSidebar
        open={vaultOpen}
        onClose={() => setVaultOpen(false)}
        groups={groups}
        groupId={groupId}
        onGroupChange={setGroupId}
        onRefresh={() => void loadItems(groupId)}
        loading={itemsLoading}
        loaded={items !== null}
        videos={videos}
        images={images}
        tabs={tabs}
        activeTab={activeTab}
        hasUnsorted={hasUnsorted}
        onTabChange={setActiveTab}
        mode={sidebarMode}
        onAddVideo={addVideo}
        onPickThumb={(slotKey, item) => setSlotThumb(slotKey, item)}
        onCancelThumb={() => setSidebarMode({ kind: 'videos' })}
      />
    </div>
  )
}

/**
 * Right sidebar — three-column thumbnail grid of the group vault. Tapping a
 * video opens an in-sidebar player (the media URL is signed + loaded only
 * then); closing it unmounts the <video> completely so nothing heavy stays
 * loaded while browsing. In thumb mode the same grid shows the vault's images
 * for the chosen post.
 */
function VaultSidebar(props: {
  open: boolean
  onClose: () => void
  groups: VaultGroup[] | null
  groupId: string
  onGroupChange: (id: string) => void
  onRefresh: () => void
  loading: boolean
  loaded: boolean
  videos: VaultItem[]
  images: VaultItem[]
  tabs: VaultTab[]
  /** '' = All, 'unsorted', or a tab id. */
  activeTab: string
  hasUnsorted: boolean
  onTabChange: (tabId: string) => void
  mode: SidebarMode
  onAddVideo: (item: VaultItem) => void
  onPickThumb: (slotKey: string, item: VaultItem) => void
  onCancelThumb: () => void
}): JSX.Element {
  const { mode } = props
  const [playing, setPlaying] = useState<VaultItem | null>(null)
  const [playUrl, setPlayUrl] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  async function play(item: VaultItem): Promise<void> {
    setPlaying(item)
    setPlayUrl(null)
    setPlayError(null)
    try {
      setPlayUrl(await signVaultItemUrl(item))
    } catch (e) {
      setPlayError(e instanceof Error ? e.message : 'Could not load the video.')
    }
  }

  // Exit the video view: stop playback and drop the source so the browser
  // releases the buffered media — keeps the site fast.
  function closePlayer(): void {
    const v = videoRef.current
    if (v) {
      v.pause()
      v.removeAttribute('src')
      v.load()
    }
    setPlaying(null)
    setPlayUrl(null)
    setPlayError(null)
  }

  // Leaving the videos view (e.g. switching to a thumbnail pick or another
  // group) also tears the player down. Same when switching tab sections —
  // the previewed video may not even be in the new tab.
  useEffect(() => {
    if (playing) closePlayer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, props.activeTab, props.groupId])

  const pickingThumb = mode.kind === 'thumb'
  const list = pickingThumb ? props.images : props.videos
  const activeTabName =
    props.activeTab === 'unsorted'
      ? 'Unsorted'
      : props.tabs.find((t) => t.id === props.activeTab)?.name || ''

  return (
    <aside
      className={`fixed inset-y-0 right-0 z-50 flex w-[min(22rem,92vw)] flex-col border-l border-white/10 bg-panel shadow-2xl transition-transform duration-200 lg:static lg:z-0 lg:w-80 lg:shrink-0 lg:border-0 lg:bg-transparent lg:shadow-none ${
        props.open ? 'translate-x-0' : 'translate-x-full lg:hidden'
      }`}
    >
      <div className="flex h-full max-h-none flex-col rounded-none border-0 bg-panel lg:max-h-[calc(100vh-6rem)] lg:sticky lg:top-0 lg:rounded-2xl lg:border lg:border-white/10 lg:bg-white/[0.03]">
        {/* Header */}
        <div className="shrink-0 border-b border-white/[0.06] p-3">
          {pickingThumb ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-accent">
                  Pick a thumbnail — post {mode.kind === 'thumb' ? mode.slotNumber : ''}
                </div>
                <p className="text-[11px] text-gray-500">Tap an image to use it as the 0.5s intro.</p>
              </div>
              <button
                className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/[0.05]"
                onClick={props.onCancelThumb}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-100">
                <FolderIcon size={15} />
                Group vault
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-gray-400 hover:bg-white/[0.06] hover:text-white"
                onClick={props.onClose}
                aria-label="Hide vault"
                title="Hide vault"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <select
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-panel2 px-2.5 py-1.5 text-xs text-gray-100 outline-none focus:border-accent/60"
              value={props.groupId}
              onChange={(e) => props.onGroupChange(e.target.value)}
            >
              <option value="">
                {props.groups === null
                  ? 'Loading your groups…'
                  : props.groups.length === 0
                    ? 'No groups yet'
                    : 'Pick a group vault…'}
              </option>
              {(props.groups || []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              className="shrink-0 rounded-xl border border-white/10 p-2 text-gray-300 hover:bg-white/[0.05] disabled:opacity-50"
              disabled={!props.groupId || props.loading}
              onClick={props.onRefresh}
              aria-label="Refresh vault"
            >
              <RefreshIcon size={14} className={props.loading ? 'animate-spin' : undefined} />
            </button>
          </div>

          {/* Tab sections — same folders as the desktop group vault */}
          {props.groupId && (props.tabs.length > 0 || props.hasUnsorted) && (
            <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-0.5">
              <button
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  props.activeTab === ''
                    ? 'bg-accent/20 text-white'
                    : 'text-gray-500 hover:bg-white/[0.06] hover:text-gray-200'
                }`}
                onClick={() => props.onTabChange('')}
              >
                All
              </button>
              {props.tabs.map((t) => (
                <button
                  key={t.id}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    props.activeTab === t.id
                      ? 'bg-accent/20 text-white'
                      : 'text-gray-500 hover:bg-white/[0.06] hover:text-gray-200'
                  }`}
                  onClick={() => props.onTabChange(t.id)}
                  title={t.name}
                >
                  {t.name}
                </button>
              ))}
              {props.hasUnsorted && (
                <button
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    props.activeTab === 'unsorted'
                      ? 'bg-accent/20 text-white'
                      : 'text-gray-500 hover:bg-white/[0.06] hover:text-gray-200'
                  }`}
                  onClick={() => props.onTabChange('unsorted')}
                >
                  Unsorted
                </button>
              )}
            </div>
          )}
        </div>

        {/* In-sidebar player (videos mode only) */}
        {playing && !pickingThumb ? (
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-xs font-medium text-gray-200">{playing.title}</div>
              <button
                className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/[0.05]"
                onClick={closePlayer}
                title="Exit the video view (unloads the video to keep the site fast)"
              >
                <CloseIcon size={12} />
                Exit
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-black">
              {playError ? (
                <p className="px-4 text-center text-xs text-red-300">{playError}</p>
              ) : !playUrl ? (
                <p className="text-xs text-gray-500">Loading the video…</p>
              ) : (
                <video
                  ref={videoRef}
                  src={playUrl}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-full w-full object-contain"
                  onLoadedMetadata={(e) => {
                    if (videoHasNoPicture(e.currentTarget)) {
                      e.currentTarget.pause()
                      setPlayError(UNPLAYABLE_VIDEO_MSG)
                    }
                  }}
                />
              )}
            </div>
            <button
              className="mt-2 shrink-0 rounded-xl bg-accent/90 px-3 py-2 text-xs font-semibold text-white hover:bg-accent"
              onClick={() => {
                props.onAddVideo(playing)
                closePlayer()
              }}
            >
              + Add to script
            </button>
          </div>
        ) : (
          /* Three-column thumbnail grid */
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!props.groupId ? (
              <p className="py-8 text-center text-xs text-gray-600">
                Pick a group vault above to browse its {pickingThumb ? 'images' : 'videos'}.
              </p>
            ) : props.loading && !props.loaded ? (
              <p className="py-8 text-center text-xs text-gray-600">Loading the vault…</p>
            ) : list.length === 0 ? (
              <p className="py-8 text-center text-xs text-gray-600">
                {pickingThumb
                  ? activeTabName
                    ? `No images in “${activeTabName}” to use as thumbnails.`
                    : 'This vault has no images to use as thumbnails.'
                  : activeTabName
                    ? `No videos in “${activeTabName}” yet.`
                    : 'This vault has no videos yet.'}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {list.map((v) => (
                  <div key={v.id} className="group relative">
                    <button
                      className="block w-full overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 transition-colors hover:border-accent/60"
                      onClick={() => {
                        if (pickingThumb && mode.kind === 'thumb') props.onPickThumb(mode.slotKey, v)
                        else void play(v)
                      }}
                      title={pickingThumb ? `Use “${v.title}” as the thumbnail` : `Preview “${v.title}”`}
                    >
                      <div className="relative aspect-[9/16] w-full">
                        {v.thumbUrl ? (
                          <img src={v.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-500">
                            {pickingThumb ? <ImageIcon size={18} /> : <FilmIcon size={18} />}
                          </div>
                        )}
                        {!pickingThumb && v.durationSeconds > 0 && (
                          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-gray-200">
                            {fmtDuration(v.durationSeconds)}
                          </span>
                        )}
                        {!pickingThumb && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-black">
                              <PlayIcon size={12} />
                            </span>
                          </span>
                        )}
                      </div>
                    </button>
                    {!pickingThumb && (
                      <button
                        className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                        onClick={() => props.onAddVideo(v)}
                        title={`Add “${v.title}” to the script without previewing`}
                      >
                        + Add
                      </button>
                    )}
                    <p className="mt-0.5 truncate text-[9px] text-gray-500" title={v.title}>
                      {v.title}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
