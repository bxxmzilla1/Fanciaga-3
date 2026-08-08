import { supabase } from './supabase'
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
    createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
    doneAt: r.done_at ? new Date(String(r.done_at)).getTime() : null
  }))
}
