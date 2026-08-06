import { useEffect, useState } from 'react'
import { listScripts } from '../lib/scripts'
import type { ScriptAccountRef, ScriptEntry } from '../lib/types'

// Scripts — every script recorded by the Script Writter in the connected
// Fanciaga account, straight from the cloud. Pick one to use it in Posting
// without exporting / uploading a file.

function accountName(ref: ScriptAccountRef): string {
  return ref.username ? `@${ref.username.replace(/^@+/, '')}` : `#${ref.accountId.slice(0, 8)}…`
}

export default function ScriptsScreen(props: {
  userId: string
  onUseInPosting: (script: ScriptEntry) => void
}): JSX.Element {
  const [scripts, setScripts] = useState<ScriptEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

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

                    <button
                      className="mt-3 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-glow transition-transform hover:scale-[1.02]"
                      onClick={() => props.onUseInPosting(s)}
                    >
                      Use in Posting →
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
