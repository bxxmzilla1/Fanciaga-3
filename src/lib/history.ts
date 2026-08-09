import { supabase } from './supabase'
import { cancelPendingCommand, forceStopEngine } from './engine'
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
