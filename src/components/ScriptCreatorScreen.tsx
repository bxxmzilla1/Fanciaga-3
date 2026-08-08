import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listGroupVaultItems,
  listMyGroups,
  signVaultItemUrl,
  type VaultGroup,
  type VaultItem
} from '../lib/vaults'
import { saveScript } from '../lib/scripts'
import type { ScriptAccountRef, ScriptEntry } from '../lib/types'

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
  /** Epoch ms this slot posts. */
  at: number
  /** Optional image merged as a 0.5s intro before the video. */
  thumb: VaultItem | null
}

/** What the right sidebar is showing: the videos, or a thumbnail pick. */
type SidebarMode = { kind: 'videos' } | { kind: 'thumb'; slotKey: string; slotNumber: number }

function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(v: string): number | null {
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : null
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
  const [itemsLoading, setItemsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slots, setSlots] = useState<CreatorSlot[]>([])
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>({ kind: 'videos' })

  // Schedule helper: first post time + gap, applied over the whole sequence.
  const [firstAt, setFirstAt] = useState(() => toLocalInput(Date.now() + 10 * 60_000))
  const [gapMinutes, setGapMinutes] = useState(60)

  const videos = useMemo(() => (items || []).filter((i) => i.kind === 'video'), [items])
  const images = useMemo(() => (items || []).filter((i) => i.kind === 'image'), [items])

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
      setItems(await listGroupVaultItems(gid))
    } catch (e) {
      setItems(null)
      setError(e instanceof Error ? e.message : 'Could not load that group vault.')
    } finally {
      setItemsLoading(false)
    }
  }

  useEffect(() => {
    setSidebarMode({ kind: 'videos' })
    if (groupId) void loadItems(groupId)
    else setItems(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  function nextSlotTime(): number {
    if (slots.length === 0) return fromLocalInput(firstAt) ?? Date.now() + 10 * 60_000
    return slots[slots.length - 1].at + gapMinutes * 60_000
  }

  function addVideo(item: VaultItem): void {
    setSavedMsg('')
    setSlots((prev) => [
      ...prev,
      { key: crypto.randomUUID(), item, at: nextSlotTime(), thumb: null }
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
    const start = fromLocalInput(firstAt)
    if (start == null) {
      setError('Set a valid date and time for the first post.')
      return
    }
    setError(null)
    setSlots((prev) => prev.map((s, i) => ({ ...s, at: start + i * gapMinutes * 60_000 })))
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
      // Slots post in chronological order — same shape the desktop Striker logs.
      const ordered = [...slots].sort((a, b) => a.at - b.at)
      const strikerSlots = ordered.map((s, i) => ({
        accountId: TEMPLATE_REF.accountId,
        keyId: TEMPLATE_REF.keyId,
        slot: ((i % 3) + 1) as 1 | 2 | 3,
        source: 'group' as const,
        groupId: s.item.groupId,
        itemId: s.item.id,
        scheduledFor: new Date(s.at).toISOString(),
        ...(s.thumb
          ? { thumbnail: { source: 'group' as const, groupId: s.thumb.groupId, itemId: s.thumb.id } }
          : {})
      }))
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
    <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-start">
      {/* ── Left: script being built ─────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">Script Creator</h1>
          <p className="mt-1 text-sm text-gray-500">
            Build a Striker-style script: add videos from the vault on the right, set the posting
            times, and save it into Scripts. The accounts you multi-select in Posting replace the
            template on every run.
          </p>
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
                Each video posts at its time. Pick an optional thumbnail image per post.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-gray-500">First post</label>
              <input
                type="datetime-local"
                className="rounded-xl border border-white/10 bg-panel2 px-2 py-1.5 text-xs text-gray-100 outline-none [color-scheme:dark]"
                value={firstAt}
                onChange={(e) => setFirstAt(e.target.value)}
              />
              <label className="text-[11px] text-gray-500">every</label>
              <input
                type="number"
                min={1}
                max={10080}
                className="w-16 rounded-xl border border-white/10 bg-panel2 px-2 py-1.5 text-center text-xs text-gray-100 outline-none [color-scheme:dark]"
                value={gapMinutes}
                onChange={(e) => setGapMinutes(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              />
              <label className="text-[11px] text-gray-500">min</label>
              <button
                className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/[0.05] disabled:opacity-50"
                disabled={slots.length === 0}
                onClick={applySchedule}
                title="Re-space every post from the first time using the interval"
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
                      <div className="flex h-full w-full items-center justify-center text-sm">🎬</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-gray-200">{s.item.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <input
                        type="datetime-local"
                        className="rounded-lg border border-white/10 bg-panel2 px-2 py-1 text-[11px] text-gray-100 outline-none [color-scheme:dark]"
                        value={toLocalInput(s.at)}
                        onChange={(e) => {
                          const t = fromLocalInput(e.target.value)
                          if (t != null) {
                            setSlots((prev) =>
                              prev.map((x) => (x.key === s.key ? { ...x, at: t } : x))
                            )
                          }
                        }}
                      />
                      {/* Thumbnail pick — opens the image grid in the right sidebar */}
                      <button
                        className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                          sidebarMode.kind === 'thumb' && sidebarMode.slotKey === s.key
                            ? 'border-accent/60 bg-accent/15 text-accent'
                            : 'border-white/10 text-gray-300 hover:bg-white/[0.05]'
                        }`}
                        onClick={() =>
                          setSidebarMode({ kind: 'thumb', slotKey: s.key, slotNumber: i + 1 })
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
                          <span>🖼 Thumbnail…</span>
                        )}
                      </button>
                      {s.thumb && (
                        <button
                          className="rounded-lg px-1.5 py-1 text-[11px] text-gray-600 hover:text-red-300"
                          onClick={() => setSlotThumb(s.key, null)}
                          title="Remove the thumbnail"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      className="rounded px-1 text-xs text-gray-500 hover:bg-white/10 hover:text-gray-200 disabled:opacity-30"
                      disabled={i === 0}
                      onClick={() => moveSlot(s.key, -1)}
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      className="rounded px-1 text-xs text-gray-500 hover:bg-white/10 hover:text-gray-200 disabled:opacity-30"
                      disabled={i === slots.length - 1}
                      onClick={() => moveSlot(s.key, 1)}
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <button
                    className="shrink-0 rounded-lg p-1.5 text-gray-600 hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => removeSlot(s.key)}
                    title="Remove this post"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar: the group vault ───────────────────────────────── */}
      <VaultSidebar
        groups={groups}
        groupId={groupId}
        onGroupChange={setGroupId}
        onRefresh={() => void loadItems(groupId)}
        loading={itemsLoading}
        loaded={items !== null}
        videos={videos}
        images={images}
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
  groups: VaultGroup[] | null
  groupId: string
  onGroupChange: (id: string) => void
  onRefresh: () => void
  loading: boolean
  loaded: boolean
  videos: VaultItem[]
  images: VaultItem[]
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
  // group) also tears the player down.
  useEffect(() => {
    if (mode.kind !== 'videos' && playing) closePlayer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind])

  const pickingThumb = mode.kind === 'thumb'
  const list = pickingThumb ? props.images : props.videos

  return (
    <aside className="w-full shrink-0 lg:sticky lg:top-0 lg:w-80">
      <div className="flex max-h-[80vh] flex-col rounded-2xl border border-white/10 bg-white/[0.03] lg:max-h-[calc(100vh-6rem)]">
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
            <div className="text-sm font-semibold text-gray-100">Group vault</div>
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
              className="shrink-0 rounded-xl border border-white/10 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-white/[0.05] disabled:opacity-50"
              disabled={!props.groupId || props.loading}
              onClick={props.onRefresh}
            >
              {props.loading ? '…' : '↻'}
            </button>
          </div>
        </div>

        {/* In-sidebar player (videos mode only) */}
        {playing && !pickingThumb ? (
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-xs font-medium text-gray-200">{playing.title}</div>
              <button
                className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/[0.05]"
                onClick={closePlayer}
                title="Exit the video view (unloads the video to keep the site fast)"
              >
                ✕ Exit video
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
                  ? 'This vault has no images to use as thumbnails.'
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
                          <div className="flex h-full w-full items-center justify-center text-xl">
                            {pickingThumb ? '🖼' : '🎬'}
                          </div>
                        )}
                        {!pickingThumb && v.durationSeconds > 0 && (
                          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-gray-200">
                            {fmtDuration(v.durationSeconds)}
                          </span>
                        )}
                        {!pickingThumb && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-lg opacity-0 transition-opacity group-hover:opacity-100">
                            ▶
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
