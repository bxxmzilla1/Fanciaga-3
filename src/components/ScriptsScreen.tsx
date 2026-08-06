import { useEffect, useMemo, useRef, useState } from 'react'
import { listScripts } from '../lib/scripts'
import { loadScriptPreview, saveScriptSchedule, signMediaUrl, type PreviewVideo } from '../lib/preview'
import type { ScriptAccountRef, ScriptEntry } from '../lib/types'

// Scripts — every script recorded by the Script Writter in the connected
// Fanciaga account, straight from the cloud. Pick one to use it in Posting
// without exporting / uploading a file, or Preview its videos in order.

function accountName(ref: ScriptAccountRef): string {
  return ref.username ? `@${ref.username.replace(/^@+/, '')}` : `#${ref.accountId.slice(0, 8)}…`
}

function fmtAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return new Date(ms).toLocaleString()
  }
}

function fmtDuration(s: number): string {
  if (!s || s <= 0) return ''
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function ScriptsScreen(props: {
  userId: string
  onUseInPosting: (script: ScriptEntry) => void
}): JSX.Element {
  const [scripts, setScripts] = useState<ScriptEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  // Script whose posting order is open in the right Preview sidebar.
  const [previewing, setPreviewing] = useState<ScriptEntry | null>(null)

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setScripts(await listScripts(props.userId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your scripts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.userId])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">Scripts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Everything you recorded with the Script Writter in your Fanciaga app.
          </p>
        </div>
        <button
          className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? 'Loading…' : 'Refresh'}
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

      {scripts === null && !error ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-gray-500">
          Loading your scripts…
        </div>
      ) : scripts && scripts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-gray-500">
          No scripts yet — open the Fanciaga app, press <span className="text-gray-300">Script Writter</span>{' '}
          to record your posting actions, then save the script and it will show up here.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(scripts || []).map((s) => {
            const open = expanded === s.id
            return (
              <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03]">
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  onClick={() => setExpanded(open ? null : s.id)}
                >
                  <span className="text-lg">📜</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-100">{s.name}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {s.actions.length} action{s.actions.length === 1 ? '' : 's'} ·{' '}
                      {s.accounts.length} account{s.accounts.length === 1 ? '' : 's'} ·{' '}
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-gray-600">{open ? '▲' : '▼'}</span>
                </button>

                {open && (
                  <div className="border-t border-white/[0.06] px-4 py-3">
                    {s.accounts.length > 0 && (
                      <div className="mb-3">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                          Accounts used
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {s.accounts.map((a) => (
                            <span
                              key={a.accountId}
                              className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-gray-300"
                            >
                              {accountName(a)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                      Logged actions
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {s.actions.length === 0 ? (
                        <div className="text-xs text-gray-600">This script has no actions.</div>
                      ) : (
                        s.actions.map((a, i) => (
                          <div
                            key={a.id}
                            className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                          >
                            <span className="mt-0.5 shrink-0 rounded-full bg-white/[0.06] px-1.5 text-[10px] text-gray-500">
                              {i + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs text-gray-200">{a.summary}</div>
                              <div className="text-[10px] text-gray-600">
                                {new Date(a.at).toLocaleString()}
                                {a.accounts.length > 0 && <> · {a.accounts.map(accountName).join(', ')}</>}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-glow transition-transform hover:scale-[1.02]"
                        onClick={() => props.onUseInPosting(s)}
                      >
                        Use in Posting →
                      </button>
                      <button
                        className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/[0.06]"
                        onClick={() => setPreviewing(s)}
                        title="See the videos this script posts, in order, with the wait time between each post"
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {previewing && (
        <ScriptPreviewSidebar script={previewing} onClose={() => setPreviewing(null)} />
      )}
    </div>
  )
}

// ── Preview sidebar — the videos a script posts, in order, with intervals ────
// Videos load and play right here in the sidebar (no fullscreen), and the wait
// between each post is editable and saved back to the script.

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function splitGap(ms: number): { d: number; h: number; m: number } {
  const total = Math.max(0, Math.round(ms / MIN))
  return { d: Math.floor(total / (24 * 60)), h: Math.floor((total % (24 * 60)) / 60), m: total % 60 }
}

function ScriptPreviewSidebar(props: { script: ScriptEntry; onClose: () => void }): JSX.Element {
  const [videos, setVideos] = useState<PreviewVideo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Editable gaps (ms) between consecutive posts — length = videos.length - 1.
  const [gaps, setGaps] = useState<number[]>([])
  // Anchor time for the first post; edits recompute every later post from here.
  const [baseAt, setBaseAt] = useState<number>(() => Date.now())
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  // Key of the post playing inline (its media is signed only while open).
  const [playingKey, setPlayingKey] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setVideos(null)
    setError(null)
    setDirty(false)
    setPlayingKey(null)
    loadScriptPreview(props.script)
      .then((v) => {
        if (!alive) return
        setVideos(v)
        setBaseAt(v[0]?.at ?? Date.now())
        setGaps(v.slice(0, -1).map((x) => x.gapToNextMs ?? 0))
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the preview.')
      })
    return () => {
      alive = false
    }
  }, [props.script])

  // Absolute post times recomputed from the anchor + (possibly edited) gaps.
  const times = useMemo(() => {
    if (!videos) return [] as number[]
    const out: number[] = []
    let t = baseAt
    for (let i = 0; i < videos.length; i++) {
      out.push(t)
      t += gaps[i] ?? 0
    }
    return out
  }, [videos, gaps, baseAt])

  function setGap(i: number, ms: number): void {
    setGaps((prev) => {
      const next = [...prev]
      next[i] = Math.max(0, ms)
      return next
    })
    setDirty(true)
    setSavedNote(null)
  }

  async function save(): Promise<void> {
    if (!videos) return
    setSaving(true)
    setError(null)
    try {
      await saveScriptSchedule(
        props.script,
        videos.map((v, i) => ({ actionIndex: v.actionIndex, slotIndex: v.slotIndex, at: times[i] }))
      )
      // Reflect the saved times locally so the list stays in sync.
      setVideos((prev) =>
        prev
          ? prev.map((v, i) => ({
              ...v,
              at: times[i],
              gapToNextMs: i < prev.length - 1 ? gaps[i] ?? 0 : null
            }))
          : prev
      )
      setDirty(false)
      setSavedNote('Intervals saved ✓')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the new intervals.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={props.onClose} />

      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-100">Preview — {props.script.name}</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Play videos here · edit the wait between posts, then save
            </p>
          </div>
          <button
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            onClick={props.onClose}
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          ) : null}
          {videos === null && !error ? (
            <p className="py-8 text-center text-xs text-gray-500">Loading the posting order…</p>
          ) : videos && videos.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-500">
              This script has no posts to preview.
            </p>
          ) : videos ? (
            <div className="flex flex-col">
              {videos.map((v, i) => (
                <div key={v.key}>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                    <div className="flex items-center gap-3">
                      {/* Thumbnail → plays the video inline in this same panel. */}
                      <button
                        className="group relative h-20 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40"
                        onClick={() => v.mediaPath && setPlayingKey(playingKey === v.key ? null : v.key)}
                        disabled={!v.mediaPath}
                        title={v.mediaPath ? 'Play here' : 'No cloud copy available'}
                      >
                        {v.thumbUrl ? (
                          <img src={v.thumbUrl} alt={v.title} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-lg text-gray-600">🎞</span>
                        )}
                        {v.mediaPath && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-80 transition-opacity group-hover:opacity-100">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 pl-0.5 text-[10px] text-black">
                              {playingKey === v.key ? '■' : '▶'}
                            </span>
                          </span>
                        )}
                        {v.durationSeconds > 0 && (
                          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[9px] tabular-nums text-white">
                            {fmtDuration(v.durationSeconds)}
                          </span>
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold text-accent">
                            {i + 1}
                          </span>
                          <span className="truncate text-xs font-medium text-gray-200" title={v.title}>
                            {v.title}
                          </span>
                        </div>
                        {v.account && <div className="mt-0.5 truncate text-[11px] text-gray-400">{v.account}</div>}
                        <div className="mt-0.5 text-[10px] text-gray-500">
                          {fmtAt(times[i])}
                          {v.kind === 'image' ? ' · image' : ''}
                        </div>
                      </div>
                    </div>

                    {/* Inline player — media is signed only while this is open. */}
                    {playingKey === v.key && (
                      <InlinePlayer video={v} onClose={() => setPlayingKey(null)} />
                    )}
                  </div>

                  {/* Editable interval until the NEXT post */}
                  {i < videos.length - 1 && (
                    <GapEditor value={gaps[i] ?? 0} onChange={(ms) => setGap(i, ms)} />
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {videos && videos.length > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
            <span className="text-[11px] text-gray-500">
              {savedNote ? <span className="text-emerald-400">{savedNote}</span> : dirty ? 'Unsaved interval changes' : 'Intervals up to date'}
            </span>
            <button
              className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save intervals'}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

// ── Interval editor — days / hours / minutes between two posts ───────────────

function GapEditor(props: { value: number; onChange: (ms: number) => void }): JSX.Element {
  const { d, h, m } = splitGap(props.value)
  const set = (nd: number, nh: number, nm: number): void =>
    props.onChange(nd * DAY + nh * HOUR + nm * MIN)
  const box =
    'w-11 rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-center text-[11px] tabular-nums text-gray-100 outline-none focus:border-accent/60'
  return (
    <div className="flex items-center gap-2 py-1.5 pl-6">
      <span className="h-4 w-px bg-white/15" />
      <span className="text-[10px] text-gray-500">wait</span>
      <label className="flex items-center gap-1 text-[10px] text-gray-500">
        <input
          type="number"
          min={0}
          value={d}
          className={box}
          onChange={(e) => set(Math.max(0, Number(e.target.value) || 0), h, m)}
        />
        d
      </label>
      <label className="flex items-center gap-1 text-[10px] text-gray-500">
        <input
          type="number"
          min={0}
          max={23}
          value={h}
          className={box}
          onChange={(e) => set(d, Math.max(0, Number(e.target.value) || 0), m)}
        />
        h
      </label>
      <label className="flex items-center gap-1 text-[10px] text-gray-500">
        <input
          type="number"
          min={0}
          max={59}
          value={m}
          className={box}
          onChange={(e) => set(d, h, Math.max(0, Number(e.target.value) || 0))}
        />
        m
      </label>
    </div>
  )
}

// ── Inline player — loads the media only while open, then tears it down ──────

function InlinePlayer(props: { video: PreviewVideo; onClose: () => void }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let alive = true
    setUrl(null)
    setError(null)
    signMediaUrl(props.video)
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the video.')
      })
    // Drop the buffered media on unmount so the panel stays light.
    return () => {
      alive = false
      const v = videoRef.current
      if (v) {
        try {
          v.pause()
          v.removeAttribute('src')
          v.load()
        } catch {
          // already detached
        }
      }
    }
  }, [props.video])

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-black">
      {error ? (
        <p className="px-3 py-4 text-center text-[11px] text-red-300">{error}</p>
      ) : !url ? (
        <p className="px-3 py-6 text-center text-[11px] text-gray-400">Loading…</p>
      ) : props.video.kind === 'image' ? (
        <img src={url} alt={props.video.title} className="max-h-72 w-full object-contain" />
      ) : (
        <video ref={videoRef} src={url} autoPlay controls playsInline className="max-h-72 w-full" />
      )}
    </div>
  )
}
