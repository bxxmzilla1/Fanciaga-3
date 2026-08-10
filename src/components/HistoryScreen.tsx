import { useEffect, useState } from 'react'
import { forceStopRun, listRuns, retryRun, updateRun, type ScriptRun } from '../lib/history'
import { waitForEngineCommand } from '../lib/engine'
import { RefreshIcon, RocketIcon, StopIcon } from './Icons'

// History — every script run started from the Posting section, with the
// Instagram accounts each run targeted and how it ended.

const STATUS_META: Record<ScriptRun['status'], { label: string; cls: string }> = {
  queued: { label: 'Queued', cls: 'bg-white/[0.06] text-gray-400' },
  running: { label: 'Running…', cls: 'bg-accent/15 text-accent' },
  done: { label: 'Done', cls: 'bg-emerald-500/15 text-emerald-300' },
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
  // Run id currently being force-stopped (disables its button).
  const [stoppingId, setStoppingId] = useState<string | null>(null)
  // Run id currently being re-sent to the engine (disables its Retry button).
  const [retryingId, setRetryingId] = useState<string | null>(null)

  async function retry(run: ScriptRun): Promise<void> {
    if (retryingId) return
    setRetryingId(run.id)
    setError(null)
    try {
      const { runId, commandId } = await retryRun(props.userId, run)
      await load(true) // the new "Queued" row appears right away
      // Track the retried run in the background: the engine picks it up (even
      // if it's offline right now — it retries once back online) and the
      // history row is closed out with the result.
      void (async () => {
        try {
          const result = await waitForEngineCommand(commandId)
          await updateRun(runId, result.ok ? 'done' : 'error', result.errors[0]?.error)
        } catch (e) {
          await updateRun(runId, 'error', e instanceof Error ? e.message : 'Retry failed.')
        }
        void load(true)
      })()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not retry that run.')
    } finally {
      setRetryingId(null)
    }
  }

  async function forceStop(run: ScriptRun): Promise<void> {
    if (stoppingId) return
    setStoppingId(run.id)
    setError(null)
    // Show it as stopped right away — the engine confirms in the background.
    setRuns((prev) =>
      prev
        ? prev.map((r) => (r.id === run.id ? { ...r, status: 'error', error: 'Force stopped.' } : r))
        : prev
    )
    try {
      await forceStopRun(props.userId, run)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not force-stop that run.')
    } finally {
      setStoppingId(null)
      void load(true)
    }
  }

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
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <RocketIcon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-100">
                      {r.scriptName || 'Untitled script'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      Started {fmt(r.createdAt)}
                      {r.doneAt != null && <> · finished {fmt(r.doneAt)}</>}
                    </div>
                  </div>
                  {(r.status === 'queued' || r.status === 'running') && (
                    <button
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                      disabled={stoppingId === r.id}
                      onClick={() => void forceStop(r)}
                      title="Stop this run — a queued run is cancelled before it starts; a running one is aborted on the engine"
                    >
                      <StopIcon size={11} />
                      {stoppingId === r.id ? 'Stopping…' : 'Force Stop'}
                    </button>
                  )}
                  {(r.status === 'done' || r.status === 'error') && (
                    <button
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] font-semibold text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
                      disabled={retryingId === r.id}
                      onClick={() => void retry(r)}
                      title="Send this exact run to the engine again — same script, same Instagram accounts. Replaces this entry with the new run."
                    >
                      <RefreshIcon size={11} className={retryingId === r.id ? 'animate-spin' : undefined} />
                      {retryingId === r.id ? 'Retrying…' : 'Retry'}
                    </button>
                  )}
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
