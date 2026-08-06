import { useMemo, useRef, useState } from 'react'
import { listEngineAccounts, runScriptOnEngine } from '../lib/engine'
import { parseScriptFile, type EngineAccount, type RunScriptResult, type ScriptAccountRef, type ScriptEntry } from '../lib/types'

// Posting — asks for the "Script" file exported from Fanciaga's Script
// Writter, shows what it will replicate (group-vault content picks, chosen
// thumbnails, per-post time intervals, accounts), lets the IG Selector swap
// the Instagram accounts, then replays it on the connected engine.

function accountName(ref: ScriptAccountRef): string {
  return ref.username ? `@${ref.username.replace(/^@+/, '')}` : `#${ref.accountId.slice(0, 8)}…`
}

export default function PostingScreen(props: { userId: string; engineOnline: boolean }): JSX.Element {
  const [script, setScript] = useState<ScriptEntry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<EngineAccount[] | null>(null)
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunScriptResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const accountById = useMemo(() => new Map((accounts || []).map((a) => [a.accountId, a])), [accounts])

  async function onFile(f: File | null): Promise<void> {
    if (!f) return
    setError(null)
    setResult(null)
    try {
      const parsed = parseScriptFile(await f.text())
      setScript(parsed)
      // Preload the saved (desktop-side) IG Selector picks.
      const initial: Record<string, string> = {}
      for (const [orig, repl] of Object.entries(parsed.replacements || {})) initial[orig] = repl.accountId
      setPicks(initial)
    } catch (e) {
      setScript(null)
      setError(e instanceof Error ? e.message : 'Could not read that Script file.')
    }
  }

  async function loadAccounts(): Promise<void> {
    setAccountsLoading(true)
    setError(null)
    try {
      setAccounts(await listEngineAccounts(props.userId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the accounts from the engine.')
    } finally {
      setAccountsLoading(false)
    }
  }

  async function run(): Promise<void> {
    if (!script) return
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const replacements: Record<string, ScriptAccountRef> = {}
      for (const [orig, id] of Object.entries(picks)) {
        if (!id || id === orig) continue
        const acc = accountById.get(id)
        if (acc) replacements[orig] = { accountId: acc.accountId, keyId: acc.keyId, username: acc.username }
        else if (script.replacements[orig]?.accountId === id) replacements[orig] = script.replacements[orig]
      }
      setResult(await runScriptOnEngine(props.userId, script, replacements))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The engine could not run the script.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-100">Posting</h1>
        <p className="mt-1 text-sm text-gray-500">
          Load the Script file exported from Fanciaga (Script Writter → Export Script). It replays
          your recorded group-vault picks, thumbnails and post time intervals on the engine.
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

      {/* Script file input */}
      <div
        className="cursor-pointer rounded-3xl border-2 border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center transition-colors hover:border-accent/40"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void onFile(e.dataTransfer.files?.[0] ?? null)
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        {script ? (
          <>
            <div className="text-sm font-semibold text-gray-100">📜 {script.name}</div>
            <div className="mt-1 text-xs text-gray-500">
              {script.actions.length} action{script.actions.length === 1 ? '' : 's'} ·{' '}
              {script.accounts.length} account{script.accounts.length === 1 ? '' : 's'} · recorded{' '}
              {new Date(script.createdAt).toLocaleString()}
            </div>
            <div className="mt-2 text-[11px] text-gray-600">Click to choose a different Script file</div>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-gray-200">Choose your “Script” file</div>
            <div className="mt-1 text-xs text-gray-500">
              Tap here (or drop the file) — <span className="font-mono">*.fanciaga-script.json</span>
            </div>
          </>
        )}
      </div>

      {script && (
        <>
          {/* Recorded actions */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 text-sm font-semibold text-gray-100">Recorded actions</div>
            <div className="flex flex-col gap-1.5">
              {script.actions.map((a, i) => (
                <div key={a.id} className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
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
              ))}
            </div>
          </div>

          {/* IG Selector */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-100">IG Selector</div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Replace the recorded Instagram accounts with different ones before running.
                </p>
              </div>
              <button
                className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
                disabled={accountsLoading || !props.engineOnline}
                onClick={() => void loadAccounts()}
              >
                {accountsLoading ? 'Loading from engine…' : accounts ? 'Reload accounts' : 'Load accounts from engine'}
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              {script.accounts.length === 0 ? (
                <div className="text-xs text-gray-600">This script recorded no accounts.</div>
              ) : (
                script.accounts.map((orig) => (
                  <div key={orig.accountId} className="flex items-center gap-2">
                    <span className="w-36 shrink-0 truncate text-xs text-gray-300">{accountName(orig)}</span>
                    <span className="text-gray-600">→</span>
                    {accounts ? (
                      <select
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-panel2 px-2.5 py-2 text-xs text-gray-100 outline-none focus:border-accent/60"
                        value={picks[orig.accountId] || orig.accountId}
                        onChange={(e) => setPicks((p) => ({ ...p, [orig.accountId]: e.target.value }))}
                      >
                        <option value={orig.accountId}>Keep {accountName(orig)}</option>
                        {accounts
                          .filter((a) => a.accountId !== orig.accountId)
                          .map((a) => (
                            <option key={a.accountId} value={a.accountId}>
                              @{(a.username || a.displayName).replace(/^@+/, '')}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-600">
                        {picks[orig.accountId] && script.replacements[orig.accountId]
                          ? `${accountName(script.replacements[orig.accountId])} (saved in script)`
                          : 'unchanged — load accounts to swap'}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Run */}
          <button
            className="rounded-2xl bg-accent px-4 py-3.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.01] disabled:opacity-50"
            disabled={running || !props.engineOnline}
            onClick={() => void run()}
          >
            {running
              ? 'Running on your engine… (posts are prepared & scheduled there)'
              : props.engineOnline
                ? 'Run Script on engine'
                : 'Engine offline — open the Fanciaga app first'}
          </button>
        </>
      )}

      {result && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            result.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          }`}
        >
          <div className="font-semibold">
            {result.ok ? 'Script started on the engine ✓' : 'Script finished with problems'}
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {result.started.map((s) => (
              <li key={s.actionId}>✓ {s.summary}</li>
            ))}
            {result.errors.map((e2) => (
              <li key={e2.actionId}>
                ✗ {e2.summary} — {e2.error}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] opacity-80">
            Follow the live progress in the Fanciaga app → History → Progress.
          </p>
        </div>
      )}
    </div>
  )
}
