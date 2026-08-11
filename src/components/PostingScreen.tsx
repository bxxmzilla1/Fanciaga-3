import { useEffect, useMemo, useRef, useState } from 'react'
import {
  enqueueScriptStack,
  listEngineAccounts,
  runScriptOnEngine,
  waitForEngineCommand
} from '../lib/engine'
import { listMyLabels, type MyLabel } from '../lib/labels'
import {
  parseScriptFile,
  type EngineAccount,
  type RunScriptResult,
  type ScriptAccountRef,
  type ScriptEntry,
  type StackedRunItem
} from '../lib/types'
import { listRuns, recordRun, setRunCommand, updateRun, type ScriptRun } from '../lib/history'
import { findMissingScriptMedia } from '../lib/preview'
import { CheckIcon, CloseIcon, ScriptIcon } from './Icons'

// Posting — load a Script, multi-select Instagram accounts to apply it to,
// then enqueue one stacked run per account on the engine (never parallel).

function accountName(ref: ScriptAccountRef): string {
  return ref.username ? `@${ref.username.replace(/^@+/, '')}` : `#${ref.accountId.slice(0, 8)}…`
}

function igLabel(a: EngineAccount): string {
  return `@${(a.username || a.displayName || a.accountId).replace(/^@+/, '')}`
}

// ── Latest run status per Instagram account ─────────────────────────────────
// Shown next to each name in the account picker: what happened to the LAST
// script run that targeted it (queued / running / force stopped / failed /
// done), when, and for which script.

function runKey(name: string): string {
  return name.trim().replace(/^@+/, '').toLowerCase()
}

function runBadge(r: ScriptRun): { label: string; cls: string } {
  if (r.status === 'queued') return { label: 'Queued', cls: 'bg-white/[0.08] text-gray-400' }
  if (r.status === 'running') return { label: 'Running…', cls: 'bg-accent/15 text-accent' }
  if (r.status === 'done') return { label: 'Done', cls: 'bg-emerald-500/15 text-emerald-300' }
  if (/^force stopped/i.test(r.error)) return { label: 'Force Stopped', cls: 'bg-orange-500/15 text-orange-300' }
  return { label: 'Failed', cls: 'bg-red-500/15 text-red-300' }
}

function fmtRunTime(ms: number): string {
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

/** Map every recorded script account → one target Instagram account. */
function replacementsForTarget(
  script: ScriptEntry,
  target: EngineAccount
): Record<string, ScriptAccountRef> {
  const ref: ScriptAccountRef = {
    accountId: target.accountId,
    keyId: target.keyId,
    username: target.username || target.displayName
  }
  const out: Record<string, ScriptAccountRef> = {}
  const originals = script.accounts.length
    ? script.accounts
    : // Fallback: pull account ids from actions if the top-level list is empty.
      script.actions.flatMap((a) => a.accounts)
  const seen = new Set<string>()
  for (const orig of originals) {
    if (!orig.accountId || seen.has(orig.accountId)) continue
    seen.add(orig.accountId)
    out[orig.accountId] = ref
  }
  return out
}

// Remember the chosen custom label across refreshes.
const LABEL_KEY = 'f3.labelId'

export default function PostingScreen(props: {
  userId: string
  engineOnline: boolean
  // Preloaded from the Scripts section ("Use in Posting") — skips the file upload.
  initialScript?: ScriptEntry | null
}): JSX.Element {
  const [script, setScript] = useState<ScriptEntry | null>(props.initialScript ?? null)
  const [error, setError] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<EngineAccount[] | null>(null)
  const [accountsLoading, setAccountsLoading] = useState(false)
  // Custom labels saved in YOUR Fanciaga account — read straight from the
  // cloud (no desktop login needed), pick one to load ONLY its accounts.
  const [labels, setLabels] = useState<MyLabel[] | null>(null)
  const [labelsLoading, setLabelsLoading] = useState(false)
  const [labelId, setLabelIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(LABEL_KEY) || ''
    } catch {
      return ''
    }
  })

  function setLabelId(id: string): void {
    setLabelIdState(id)
    try {
      if (id) localStorage.setItem(LABEL_KEY, id)
      else localStorage.removeItem(LABEL_KEY)
    } catch {
      // storage unavailable
    }
  }
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [running, setRunning] = useState(false)
  const [stack, setStack] = useState<StackedRunItem[]>([])
  const [singleResult, setSingleResult] = useState<RunScriptResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const accountById = useMemo(() => new Map((accounts || []).map((a) => [a.accountId, a])), [accounts])

  // "@username" → most recent script run that targeted it. Refreshed on a
  // timer so the badges follow runs as they move queued → running → done.
  const [runsByAccount, setRunsByAccount] = useState<Map<string, ScriptRun>>(new Map())
  useEffect(() => {
    let alive = true
    const loadRuns = async (): Promise<void> => {
      try {
        const runs = await listRuns(props.userId) // newest first
        if (!alive) return
        const map = new Map<string, ScriptRun>()
        for (const r of runs) {
          for (const name of r.accounts) {
            const key = runKey(name)
            if (key && !map.has(key)) map.set(key, r)
          }
        }
        setRunsByAccount(map)
      } catch {
        // history table missing — the picker just shows no badges
      }
    }
    void loadRuns()
    const t = window.setInterval(() => void loadRuns(), 15_000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [props.userId])

  const filtered = useMemo(() => {
    if (!accounts) return []
    const q = search.trim().toLowerCase().replace(/^@+/, '')
    if (!q) return accounts
    return accounts.filter((a) => {
      const u = (a.username || '').toLowerCase()
      const d = (a.displayName || '').toLowerCase()
      return u.includes(q) || d.includes(q)
    })
  }, [accounts, search])

  async function onFile(f: File | null): Promise<void> {
    if (!f) return
    setError(null)
    setSingleResult(null)
    setStack([])
    try {
      const parsed = parseScriptFile(await f.text())
      setScript(parsed)
      setSelected(new Set())
    } catch (e) {
      setScript(null)
      setError(e instanceof Error ? e.message : 'Could not read that Script file.')
    }
  }

  async function loadLabels(): Promise<void> {
    setLabelsLoading(true)
    try {
      const list = await listMyLabels(props.userId)
      setLabels(list)
      // Drop a remembered label that no longer exists.
      if (labelId && !list.some((l) => l.id === labelId)) setLabelId('')
    } catch {
      setLabels([])
    } finally {
      setLabelsLoading(false)
    }
  }

  // Labels come straight from this account's cloud data — load immediately,
  // no engine required (works for code-connected guests too).
  useEffect(() => {
    if (labels === null && !labelsLoading) void loadLabels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadAccounts(): Promise<void> {
    setAccountsLoading(true)
    setError(null)
    try {
      // Resolve the chosen label to its usernames so the engine can filter
      // even when this account isn't logged into it (guest mode).
      let sel: MyLabel | null = null
      if (labelId) {
        const list = labels ?? (await listMyLabels(props.userId).catch(() => [] as MyLabel[]))
        if (labels === null) setLabels(list)
        sel = list.find((l) => l.id === labelId) || null
      }
      setAccounts(
        await listEngineAccounts(
          props.userId,
          sel ? { id: sel.id, usernames: sel.usernames } : undefined
        )
      )
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the accounts from the engine.')
    } finally {
      setAccountsLoading(false)
    }
  }

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllFiltered(): void {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const a of filtered) next.add(a.accountId)
      return next
    })
  }

  function clearSelection(): void {
    setSelected(new Set())
  }

  async function run(): Promise<void> {
    if (!script) return
    setRunning(true)
    setError(null)
    setSingleResult(null)
    setStack([])

    try {
      // Pre-flight: every video + thumbnail this script references must still
      // exist in the vault — otherwise the engine fails mid-run with "that
      // shared item no longer exists". Catch it here, before anything queues.
      const missing = await findMissingScriptMedia(script)
      if (missing.length) {
        setError(
          `This script can't run — some of its vault media no longer exists. Rebuild it in the Script Creator (or restore the items), then try again.\n${missing.join('\n')}`
        )
        return
      }

      const targets = [...selected]
        .map((id) => accountById.get(id))
        .filter((a): a is EngineAccount => !!a)

      if (targets.length === 0) {
        // No multi-select — run once with the script's saved replacements.
        // History: the run targets the replacements (or the recorded accounts).
        const names = [
          ...new Set(
            [...Object.values(script.replacements || {}), ...script.accounts]
              .map((r) => (r.username ? `@${r.username.replace(/^@+/, '')}` : ''))
              .filter(Boolean)
          )
        ]
        const runId = await recordRun(props.userId, script, names)
        void updateRun(runId, 'running')
        try {
          const result = await runScriptOnEngine(
            props.userId,
            script,
            script.replacements || {},
            (cid) => void setRunCommand(runId, cid)
          )
          setSingleResult(result)
          void updateRun(runId, result.ok ? 'done' : 'error', result.errors[0]?.error)
        } catch (e) {
          void updateRun(runId, 'error', e instanceof Error ? e.message : 'Run failed.')
          throw e
        }
        return
      }

      // Build one stacked run per selected Instagram account. All are enqueued
      // up front; the desktop engine processes them strictly one at a time.
      const runs = targets.map((t) => ({ replacements: replacementsForTarget(script, t) }))
      const items: StackedRunItem[] = targets.map((t) => ({
        accountId: t.accountId,
        username: igLabel(t),
        status: 'queued'
      }))
      setStack(items)

      // History: one row per stacked run (best-effort — never blocks posting).
      const runIds = await Promise.all(
        targets.map((t) => recordRun(props.userId, script, [igLabel(t)]))
      )

      const commandIds = await enqueueScriptStack(props.userId, script, runs)
      // Link each history row to its engine command so Force Stop can target it.
      commandIds.forEach((cid, i) => void setRunCommand(runIds[i], cid))

      for (let i = 0; i < commandIds.length; i++) {
        setStack((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, status: 'running' } : item))
        )
        void updateRun(runIds[i], 'running')
        try {
          const result = await waitForEngineCommand(commandIds[i])
          setStack((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: result.ok ? 'done' : 'error', result, error: result.ok ? undefined : result.errors[0]?.error } : item
            )
          )
          void updateRun(runIds[i], result.ok ? 'done' : 'error', result.errors[0]?.error)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Run failed.'
          setStack((prev) =>
            prev.map((item, idx) => (idx === i ? { ...item, status: 'error', error: msg } : item))
          )
          void updateRun(runIds[i], 'error', msg)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The engine could not run the script.')
    } finally {
      setRunning(false)
    }
  }

  const selectedCount = selected.size
  const stackDone = stack.filter((s) => s.status === 'done').length
  const stackFailed = stack.filter((s) => s.status === 'error').length

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-100">Posting</h1>
        <p className="mt-1 text-sm text-gray-500">
          Load a Script, multi-select the Instagram accounts to apply it to, then run — each
          account is stacked on the engine one after another (never at the same time) so API rate
          limits stay safe.
        </p>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span className="whitespace-pre-line">{error}</span>
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
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent">
                <ScriptIcon size={14} />
              </span>
              <span className="min-w-0 truncate">{script.name}</span>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {script.actions.length} action{script.actions.length === 1 ? '' : 's'} ·{' '}
              {script.accounts.length} recorded account{script.accounts.length === 1 ? '' : 's'} ·{' '}
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
              ))}
            </div>
          </div>

          {/* Multi-select IG accounts */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div>
              <div className="text-sm font-semibold text-gray-100">Apply script to accounts</div>
              <p className="mt-0.5 text-xs text-gray-500">
                Multi-select Instagram accounts. The same script runs once per account, stacked
                in order — never overlapping.
              </p>
            </div>

            {/* Custom label picker — loads only the labeled accounts (fast) */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-panel2 px-3 py-2 text-xs text-gray-100 outline-none focus:border-accent/60 disabled:opacity-50"
                value={labelId}
                disabled={labelsLoading}
                onChange={(e) => setLabelId(e.target.value)}
              >
                <option value="">
                  {labelsLoading
                    ? 'Loading your custom labels…'
                    : labels && labels.length === 0
                      ? 'No custom labels saved — all accounts'
                      : 'All accounts (slower)'}
                </option>
                {(labels || []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.count} account{l.count === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.05] disabled:opacity-50"
                disabled={labelsLoading}
                onClick={() => void loadLabels()}
                title="Refresh the custom labels saved in your Fanciaga account"
              >
                {labelsLoading ? 'Labels…' : 'Refresh labels'}
              </button>
              <button
                className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
                disabled={accountsLoading || !props.engineOnline}
                onClick={() => void loadAccounts()}
              >
                {accountsLoading
                  ? 'Loading from engine…'
                  : accounts
                    ? labelId
                      ? 'Reload labeled accounts'
                      : 'Reload accounts'
                    : labelId
                      ? 'Load labeled accounts'
                      : 'Load accounts from engine'}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-600">
              Pick one of the custom labels saved in your Fanciaga account to load only those
              Instagram accounts — much faster than loading everything. Labels work even when your
              account isn’t logged into the connected engine.
            </p>

            {!accounts ? (
              <div className="mt-3 text-xs text-gray-600">
                Load accounts from the engine to multi-select where this script should run.
              </div>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-panel2 px-3 py-2 text-xs text-gray-100 placeholder-gray-600 outline-none focus:border-accent/60"
                    placeholder="Search @username…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.05]"
                    onClick={selectAllFiltered}
                  >
                    Select all{search.trim() ? ' (filtered)' : ''}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.05]"
                    onClick={clearSelection}
                    disabled={selectedCount === 0}
                  >
                    Clear
                  </button>
                  <span className="text-xs text-gray-500">
                    {selectedCount} selected
                  </span>
                </div>

                <div className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/20 p-2">
                  {filtered.length === 0 ? (
                    <div className="px-2 py-4 text-center text-xs text-gray-600">No accounts match.</div>
                  ) : (
                    filtered.map((a) => {
                      const checked = selected.has(a.accountId)
                      const lastRun =
                        runsByAccount.get(runKey(a.username || '')) ||
                        runsByAccount.get(runKey(a.displayName || ''))
                      const badge = lastRun ? runBadge(lastRun) : null
                      return (
                        <label
                          key={a.accountId}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                            checked ? 'bg-accent/15 text-gray-100' : 'text-gray-300 hover:bg-white/[0.04]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[var(--tw-accent,#7c6cff)]"
                            checked={checked}
                            onChange={() => toggle(a.accountId)}
                          />
                          <span className="truncate font-medium">{igLabel(a)}</span>
                          {a.displayName && a.displayName !== a.username && (
                            <span className="truncate text-gray-600">{a.displayName}</span>
                          )}
                          {lastRun && badge && (
                            <span
                              className="ml-auto flex shrink-0 flex-col items-end gap-0.5"
                              title={`Last run: ${badge.label} — “${lastRun.scriptName}” · ${fmtRunTime(lastRun.doneAt ?? lastRun.createdAt)}${lastRun.error ? ` · ${lastRun.error}` : ''}`}
                            >
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${badge.cls}`}>
                                {badge.label}
                              </span>
                              <span className="max-w-40 truncate text-[9px] text-gray-600">
                                {lastRun.scriptName} · {fmtRunTime(lastRun.doneAt ?? lastRun.createdAt)}
                              </span>
                            </span>
                          )}
                        </label>
                      )
                    })
                  )}
                </div>

                {selectedCount > 0 && (
                  <p className="mt-2 text-[11px] text-gray-500">
                    Queue: {selectedCount} stacked run{selectedCount === 1 ? '' : 's'} — account 1
                    finishes completely before account 2 starts.
                  </p>
                )}
              </>
            )}
          </div>

          {/* Run — allowed even while the engine is offline: the runs queue in
              the cloud and start automatically the moment the engine is back. */}
          <button
            className="rounded-2xl bg-accent px-4 py-3.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.01] disabled:opacity-50"
            disabled={running}
            onClick={() => void run()}
          >
            {running
              ? selectedCount > 0
                ? `Stacking on engine… (${stackDone + stackFailed}/${selectedCount})`
                : 'Running on your engine…'
              : selectedCount > 0
                ? `Run script on ${selectedCount} account${selectedCount === 1 ? '' : 's'} (stacked)`
                : 'Run Script once (no accounts selected)'}
          </button>
          {!props.engineOnline && (
            <p className="-mt-2 text-center text-[11px] text-amber-300/90">
              Engine offline — runs will queue and start automatically as soon as the Fanciaga app
              reconnects.
            </p>
          )}
        </>
      )}

      {/* Stack progress */}
      {stack.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-100">Stacked runs</div>
            <span className="text-xs text-gray-500">
              {stackDone} done
              {stackFailed > 0 ? ` · ${stackFailed} failed` : ''}
              {' · '}
              {stack.filter((s) => s.status === 'queued' || s.status === 'running').length} remaining
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {stack.map((item, i) => (
              <div
                key={item.accountId}
                className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs"
              >
                <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 text-[10px] text-gray-500">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-gray-200">{item.username}</span>
                {item.status === 'queued' && <span className="text-gray-500">Queued</span>}
                {item.status === 'running' && <span className="text-accent">Running…</span>}
                {item.status === 'done' && (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <CheckIcon size={12} /> Done
                  </span>
                )}
                {item.status === 'error' && (
                  <span className="max-w-[55%] truncate text-red-300" title={item.error}>
                    {item.error || 'Failed'}
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-gray-600">
            Live step-by-step progress is in the Fanciaga app → History → Progress (shows which
            Fanciaga account owns each run).
          </p>
        </div>
      )}

      {singleResult && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            singleResult.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          }`}
        >
          <div className="font-semibold">
            {singleResult.ok ? (
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon size={14} /> Script started on the engine
              </span>
            ) : (
              'Script finished with problems'
            )}
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-xs">
            {singleResult.started.map((s) => (
              <li key={s.actionId} className="flex items-start gap-1.5">
                <CheckIcon size={12} className="mt-0.5 shrink-0" />
                <span>{s.summary}</span>
              </li>
            ))}
            {singleResult.errors.map((e2) => (
              <li key={e2.actionId} className="flex items-start gap-1.5">
                <CloseIcon size={12} className="mt-0.5 shrink-0" />
                <span>
                  {e2.summary} — {e2.error}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
