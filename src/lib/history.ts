import { supabase } from './supabase'
import { cancelPendingCommand, forceStopEngine } from './engine'
import { findMissingScriptMedia } from './preview'
import type { ScriptEntry } from './types'

// Run history — one `script_runs` row per script run started from Posting
// (one per Instagram account on stacked runs). Recording is best-effort:
// posting must never break because the history table isn't migrated yet.

export type RunStatus = 'queued' | 'running' | 'done' | 'error'

export interface ScriptRun {
  id: string
  scriptId: string
  scriptName: string
  /** "@username" list this run targeted. */
  accounts: string[]
  status: RunStatus
  error: string
  /** The engine_commands row backing this run ('' on older rows). */
  commandId: string
  createdAt: number
  doneAt: number | null
}

/** Insert a run row (status "queued"). Returns null when it can't be saved. */
export async function recordRun(
  userId: string,
  script: ScriptEntry,
  accounts: string[]
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('script_runs')
      .insert({
        user_id: userId,
        script_id: script.id,
        script_name: script.name,
        accounts,
        status: 'queued'
      })
      .select('id')
      .single()
    if (error || !data) return null
    return String(data.id)
  } catch {
    return null
  }
}

/** Link a run to its engine command so History's Force Stop can target it. */
export async function setRunCommand(id: string | null, commandId: string): Promise<void> {
  if (!id || !commandId) return
  try {
    await supabase.from('script_runs').update({ command_id: commandId }).eq('id', id)
  } catch {
    // column not migrated yet — Force Stop falls back to "stop everything"
  }
}

/** Update a run's status (and error). No-op for runs that couldn't be saved. */
export async function updateRun(
  id: string | null,
  status: RunStatus,
  error?: string
): Promise<void> {
  if (!id) return
  try {
    await supabase
      .from('script_runs')
      .update({
        status,
        error: error || '',
        done_at: status === 'done' || status === 'error' ? new Date().toISOString() : null
      })
      .eq('id', id)
  } catch {
    // best-effort
  }
}

export async function listRuns(userId: string): Promise<ScriptRun[]> {
  const { data, error } = await supabase
    .from('script_runs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message || '')) {
      throw new Error(
        'The run history table is missing — apply the latest supabase/schema.sql to your Supabase project first.'
      )
    }
    throw new Error(error.message || 'Could not load the run history.')
  }
  return ((data as Array<Record<string, unknown>>) || []).map((r) => ({
    id: String(r.id),
    scriptId: String(r.script_id ?? ''),
    scriptName: String(r.script_name ?? 'Untitled script'),
    accounts: Array.isArray(r.accounts) ? (r.accounts as string[]).map(String) : [],
    status: (['queued', 'running', 'done', 'error'].includes(String(r.status))
      ? String(r.status)
      : 'queued') as RunStatus,
    error: String(r.error ?? ''),
    commandId: String(r.command_id ?? ''),
    createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
    doneAt: r.done_at ? new Date(String(r.done_at)).getTime() : null
  }))
}

/**
 * Reconcile in-flight runs against the engine's OWN command statuses. The
 * Fanciaga app each run was addressed to (own engine or by code) updates its
 * `engine_commands` row at every step — pending → running → done/error — so
 * that row is the live truth even when the tab that started the run is long
 * closed. Runs already in a final state are never touched (so a local
 * "Force stopped." isn't resurrected while the engine winds down).
 * Status changes are written back to `script_runs` (best-effort) so History
 * shows the same live picture on every device.
 */
export async function syncRunsWithEngine(runs: ScriptRun[]): Promise<ScriptRun[]> {
  const inFlight = (r: ScriptRun): boolean =>
    (r.status === 'queued' || r.status === 'running') && !!r.commandId
  const open = runs.filter(inFlight)
  if (!open.length) return runs

  let rows: Array<Record<string, unknown>>
  try {
    const { data, error } = await supabase
      .from('engine_commands')
      .select('id, status, result')
      .in('id', [...new Set(open.map((r) => r.commandId))])
    if (error) return runs
    rows = (data as Array<Record<string, unknown>>) || []
  } catch {
    return runs
  }
  const byId = new Map(rows.map((r) => [String(r.id), r]))

  const next = runs.map((run): ScriptRun => {
    if (!inFlight(run)) return run
    const cmd = byId.get(run.commandId)
    if (!cmd) {
      // Command row gone — the engine cleans them up (~24h) or it was
      // force-deleted. A fresh run can also just be read-after-write lag, so
      // only close out clearly stale ones.
      if (Date.now() - run.createdAt > 10 * 60_000) {
        return {
          ...run,
          status: 'error',
          error: 'The engine no longer has this run — retry it or start it again from Posting.',
          doneAt: run.doneAt ?? Date.now()
        }
      }
      return run
    }
    const status = String(cmd.status)
    const result = (cmd.result ?? {}) as Record<string, unknown>
    if (status === 'pending') return run.status === 'queued' ? run : { ...run, status: 'queued' }
    if (status === 'running') return run.status === 'running' ? run : { ...run, status: 'running' }
    if (status === 'done') {
      const ok = !!result.ok
      const errs = Array.isArray(result.errors)
        ? (result.errors as Array<Record<string, unknown>>)
        : []
      const msg = typeof errs[0]?.error === 'string' ? String(errs[0].error) : ''
      return {
        ...run,
        status: ok ? 'done' : 'error',
        error: ok ? '' : msg || 'The engine reported an error.',
        doneAt: run.doneAt ?? Date.now()
      }
    }
    if (status === 'error') {
      return {
        ...run,
        status: 'error',
        error: typeof result.error === 'string' ? result.error : 'The engine reported an error.',
        doneAt: run.doneAt ?? Date.now()
      }
    }
    return run
  })

  // Persist whatever changed so other devices see the same statuses.
  next.forEach((run, i) => {
    if (runs[i].status !== run.status || runs[i].error !== run.error) {
      void updateRun(run.id, run.status, run.error || undefined)
    }
  })
  return next
}

/** Run history, live-reconciled with the engine's command statuses. */
export async function listRunsSynced(userId: string): Promise<ScriptRun[]> {
  return syncRunsWithEngine(await listRuns(userId))
}

/**
 * Retry a run: re-send the EXACT original command (same script, same account
 * replacements, same target engine) as a brand-new engine command, with a new
 * history row to track it. The old history row is deleted — the retry
 * REPLACES it, so History never shows both. Works as long as the original
 * `engine_commands` row still exists (the engine cleans them up after ~24h).
 */
export async function retryRun(
  userId: string,
  run: ScriptRun
): Promise<{ runId: string | null; commandId: string }> {
  if (!run.commandId) {
    throw new Error('This run is too old to retry — start it again from Posting.')
  }
  const { data } = await supabase
    .from('engine_commands')
    .select('command, payload, engine_code')
    .eq('id', run.commandId)
    .maybeSingle()
  const row = data as Record<string, unknown> | null
  if (!row || String(row.command) !== 'run_script') {
    throw new Error(
      'The original run data was already cleaned up — start it again from Posting.'
    )
  }

  // Pre-flight: the script's videos + thumbnails must still exist in the
  // vault, or the engine would fail this retry the same way again.
  const payloadScript = ((row.payload || {}) as Record<string, unknown>).script as
    | ScriptEntry
    | undefined
  if (payloadScript?.actions) {
    const missing = await findMissingScriptMedia(payloadScript).catch(() => [])
    if (missing.length) {
      throw new Error(
        `Can't retry — some of this script's vault media no longer exists. ${missing.join(' · ')}`
      )
    }
  }

  const insert: Record<string, unknown> = {
    user_id: userId,
    command: 'run_script',
    payload: row.payload ?? {}
  }
  if (row.engine_code) insert.engine_code = row.engine_code
  const { data: cmd, error } = await supabase
    .from('engine_commands')
    .insert(insert)
    .select('id')
    .single()
  if (error || !cmd) {
    throw new Error('Could not send the retry to the engine — check your connection and try again.')
  }
  const commandId = String(cmd.id)

  // New history row for the retry (best-effort, like recordRun).
  let runId: string | null = null
  try {
    const { data: rr } = await supabase
      .from('script_runs')
      .insert({
        user_id: userId,
        script_id: run.scriptId,
        script_name: run.scriptName,
        accounts: run.accounts,
        status: 'queued',
        command_id: commandId
      })
      .select('id')
      .single()
    runId = rr ? String(rr.id) : null
  } catch {
    runId = null
  }

  // The retry replaces the old run — drop its history row so the section
  // shows a single entry per script run. Only after the new row exists, so a
  // failed retry never loses the original record.
  try {
    await supabase.from('script_runs').delete().eq('id', run.id)
  } catch {
    // best-effort — worst case the old row lingers alongside the retry
  }
  return { runId, commandId }
}

/**
 * Force-stop a queued or running run. Fast path: cancel the engine command
 * while it's still pending (never reaches the engine). Otherwise the engine
 * is told to abort it (or, for older rows without a command id, to stop
 * everything this account has queued/running).
 */
export async function forceStopRun(userId: string, run: ScriptRun): Promise<void> {
  let stopped = false
  let engineCode = ''
  if (run.commandId) {
    stopped = await cancelPendingCommand(run.commandId).catch(() => false)
    if (!stopped) {
      // Send the stop to the SAME engine the run was addressed to (it may
      // have gone to another engine by code, not our own).
      try {
        const { data } = await supabase
          .from('engine_commands')
          .select('engine_code')
          .eq('id', run.commandId)
          .maybeSingle()
        engineCode = String((data as Record<string, unknown> | null)?.engine_code || '')
      } catch {
        engineCode = ''
      }
    }
  }
  if (!stopped) {
    await forceStopEngine(userId, run.commandId || undefined, engineCode || undefined)
  }
  await updateRun(run.id, 'error', 'Force stopped.')
}
