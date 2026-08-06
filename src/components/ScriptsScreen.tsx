import { useEffect, useRef, useState } from 'react'
import { listScripts } from '../lib/scripts'
import { loadScriptPreview, signMediaUrl, type PreviewVideo } from '../lib/preview'
import type { ScriptAccountRef, ScriptEntry } from '../lib/types'

// Scripts — every script recorded by the Script Writter in the connected
// Fanciaga account, straight from the cloud. Pick one to use it in Posting
// without exporting / uploading a file, or Preview its videos in order.

function accountName(ref: ScriptAccountRef): string {
  return ref.username ? `@${ref.username.replace(/^@+/, '')}` : `#${ref.accountId.slice(0, 8)}…`
}

function fmtGap(ms: number): string {
  const mins = Math.round(ms / 60_000)
  if (mins < 1) return 'right after'
  const d = Math.floor(mins / (60 * 24))
  const h = Math.floor((mins % (60 * 24)) / 60)
  const m = mins % 60
  const parts: string[] = []
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m || parts.length === 0) parts.push(`${m}m`)
  return parts.join(' ')
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

function ScriptPreviewSidebar(props: { script: ScriptEntry; onClose: () => void }): JSX.Element {
  const [videos, setVideos] = useState<PreviewVideo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Entry currently playing fullscreen (media is loaded only then).
  const [playing, setPlaying] = useState<PreviewVideo | null>(null)

  useEffect(() => {
    let alive = true
    setVideos(null)
    setError(null)
    loadScriptPreview(props.script)
      .then((v) => {
        if (alive) setVideos(v)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the preview.')
      })
    return () => {
      alive = false
    }
  }, [props.script])

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={props.onClose} />

      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-100">Preview — {props.script.name}</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Videos in posting order · tap play to watch fullscreen
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
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          ) : videos === null ? (
            <p className="py-8 text-center text-xs text-gray-500">Loading the posting order…</p>
          ) : videos.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-500">
              This script has no posts to preview.
            </p>
          ) : (
            <div className="flex flex-col">
              {videos.map((v, i) => (
                <div key={v.key}>
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                    {/* First-frame thumbnail with a play button — the actual
                        video is never loaded here, only when playing. */}
                    <button
                      className="group relative h-20 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40"
                      onClick={() => v.mediaPath && setPlaying(v)}
                      disabled={!v.mediaPath}
                      title={v.mediaPath ? 'Play fullscreen' : 'No cloud copy available'}
                    >
                      {v.thumbUrl ? (
                        <img
                          src={v.thumbUrl}
                          alt={v.title}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-lg text-gray-600">
                          🎞
                        </span>
                      )}
                      {v.mediaPath && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-80 transition-opacity group-hover:opacity-100">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 pl-0.5 text-[10px] text-black">
                            ▶
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
                      {v.account && (
                        <div className="mt-0.5 truncate text-[11px] text-gray-400">{v.account}</div>
                      )}
                      <div className="mt-0.5 text-[10px] text-gray-500">
                        {v.at != null ? fmtAt(v.at) : 'Posts immediately'}
                        {v.kind === 'image' ? ' · image' : ''}
                      </div>
                    </div>
                  </div>

                  {/* Interval until the NEXT post */}
                  {i < videos.length - 1 && (
                    <div className="flex items-center gap-2 py-1.5 pl-6">
                      <span className="h-4 w-px bg-white/15" />
                      <span className="text-[10px] text-gray-500">
                        {v.gapToNextMs != null
                          ? `wait ${fmtGap(v.gapToNextMs)} until the next post`
                          : 'next post time not set'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {playing && <FullscreenPlayer video={playing} onClose={() => setPlaying(null)} />}
    </>
  )
}

// ── Fullscreen player — loads the media only while open, then tears it down ──

function FullscreenPlayer(props: { video: PreviewVideo; onClose: () => void }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // The heavy media URL is signed only now — the sidebar list never loads it.
  useEffect(() => {
    let alive = true
    signMediaUrl(props.video)
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the video.')
      })
    return () => {
      alive = false
    }
  }, [props.video])

  // Best-effort real fullscreen; falls back to the full-viewport overlay.
  useEffect(() => {
    const el = wrapRef.current
    el?.requestFullscreen?.().catch(() => undefined)
    const onFsChange = (): void => {
      if (!document.fullscreenElement) close()
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Stop playback and drop the buffered media before unmounting, so closing
   *  the fullscreen frees the decoder + cache and the app stays fast. */
  function close(): void {
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
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    props.onClose()
  }

  return (
    <div ref={wrapRef} className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <button
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white backdrop-blur transition-colors hover:bg-white/20"
        onClick={close}
      >
        ✕ Close
      </button>

      {error ? (
        <p className="max-w-sm px-6 text-center text-sm text-red-300">{error}</p>
      ) : !url ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : props.video.kind === 'image' ? (
        <img src={url} alt={props.video.title} className="max-h-full max-w-full object-contain" />
      ) : (
        <video
          ref={videoRef}
          src={url}
          autoPlay
          controls
          playsInline
          className="max-h-full max-w-full"
        />
      )}
    </div>
  )
}
