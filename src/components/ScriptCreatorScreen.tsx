import { useEffect, useMemo, useState } from 'react'
import { listGroupVaultItems, listMyGroups, type VaultGroup, type VaultItem } from '../lib/vaults'
import { saveScript } from '../lib/scripts'
import type { ScriptAccountRef, ScriptEntry } from '../lib/types'

// Script Creator — the Striker-style builder, right in Fanciaga 3. Browse the
// group vaults you belong to (videos + thumbnail images), stack videos into
// scheduled slots, then save the result as a Script. The saved script targets
// one "template" account: in Posting you multi-select the real Instagram
// accounts and the IG Selector swaps them in, one stacked run per account.

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
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-100">Script Creator</h1>
        <p className="mt-1 text-sm text-gray-500">
          Build a Striker-style script here: pick videos from your group vaults, set the posting
          times, and save it straight into Scripts. When you run it from Posting, the accounts you
          multi-select replace the template.
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

      {/* Group vault browser */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-gray-100">Group vault</div>
        <p className="mt-0.5 text-xs text-gray-500">
          Videos and thumbnail images from every group you're a member of.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-panel2 px-3 py-2 text-xs text-gray-100 outline-none focus:border-accent/60"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">
              {groups === null
                ? 'Loading your groups…'
                : groups.length === 0
                  ? 'No groups — join or create one in the Fanciaga app'
                  : 'Pick a group vault…'}
            </option>
            {(groups || []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.05] disabled:opacity-50"
            disabled={!groupId || itemsLoading}
            onClick={() => void loadItems(groupId)}
          >
            {itemsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {itemsLoading && !items ? (
          <div className="mt-4 text-center text-xs text-gray-600">Loading the vault…</div>
        ) : items && videos.length === 0 ? (
          <div className="mt-4 text-center text-xs text-gray-600">This vault has no videos yet.</div>
        ) : items ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {videos.map((v) => (
              <button
                key={v.id}
                className="group flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-black/20 text-left transition-colors hover:border-accent/50"
                onClick={() => addVideo(v)}
                title={`Add “${v.title}” to the script`}
              >
                <div className="relative aspect-[9/16] w-full overflow-hidden bg-black/40">
                  {v.thumbUrl ? (
                    <img src={v.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl">🎬</div>
                  )}
                  {v.durationSeconds > 0 && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-gray-200">
                      {fmtDuration(v.durationSeconds)}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                    + Add
                  </span>
                </div>
                <span className="truncate px-1.5 py-1 text-[10px] text-gray-400">{v.title}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Sequence (the script being built) */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-100">
              Posting sequence {slots.length > 0 && <span className="text-gray-500">({slots.length})</span>}
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
            Tap videos above to stack them here in posting order.
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
                    <select
                      className="max-w-40 rounded-lg border border-white/10 bg-panel2 px-2 py-1 text-[11px] text-gray-300 outline-none"
                      value={s.thumb?.id || ''}
                      onChange={(e) => {
                        const t = images.find((x) => x.id === e.target.value) || null
                        setSlots((prev) =>
                          prev.map((x) => (x.key === s.key ? { ...x, thumb: t } : x))
                        )
                      }}
                      title="Optional thumbnail image (0.5s intro before the video)"
                    >
                      <option value="">No thumbnail</option>
                      {images.map((img) => (
                        <option key={img.id} value={img.id}>
                          🖼 {img.title}
                        </option>
                      ))}
                    </select>
                    {s.thumb?.thumbUrl && (
                      <img
                        src={s.thumb.thumbUrl}
                        alt=""
                        className="h-7 w-7 rounded-md object-cover"
                        title={s.thumb.title}
                      />
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
  )
}
