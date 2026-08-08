import { useEffect, useState } from 'react'
import { listRuns, type ScriptRun } from '../lib/history'

// History — every script run started from the Posting section, with the
// Instagram accounts each run targeted and how it ended.

const STATUS_META: Record<ScriptRun['status'], { label: string; cls: string }> = {
  queued: { label: 'Queued', cls: 'bg-white/[0.06] text-gray-400' },
  running: { label: 'Running…', cls: 'bg-accent/15 text-accent' },
  done: { label: 'Done ✓', cls: 'bg-emerald-500/15 text-emerald-300' },
  error: { label: 'Failed', cls: 'bg-red-500/15 text-red-300' }
}

function fmt(ms: number): string {
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

export default function HistoryScreen(props: { userId: string }): JSX.Element {
  const [runs, setRuns] = useState<ScriptRun[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(silent = false): Promise<void> {
    if (!silent) setLoading(true)
    try {
      setRuns(await listRuns(props.userId))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the run history.')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // Load on open + refresh quietly while runs are still in flight.
  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(true), 15_000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.userId])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">History</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every script you ran from Posting, with the Instagram accounts it targeted.
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
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {runs === null && !error ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-gray-500">
          Loading your run history…
        </div>
      ) : runs && runs.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-gray-500">
          No runs yet — start a script in the Posting section and it will show up here.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(runs || []).map((r) => {
            const meta = STATUS_META[r.status]
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🚀</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-100">
                      {r.scriptName || 'Untitled script'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      Started {fmt(r.createdAt)}
                      {r.doneAt != null && <> · finished {fmt(r.doneAt)}</>}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                    {meta.label}
                  </span>
                </div>

                {r.accounts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.accounts.map((a) => (
                      <span
                        key={a}
                        className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-gray-300"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                )}

                {r.status === 'error' && r.error && (
                  <p className="mt-2 break-words text-[11px] text-red-300">{r.error}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
