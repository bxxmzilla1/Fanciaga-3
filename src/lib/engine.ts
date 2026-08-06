import { supabase } from './supabase'
import type { EngineAccount, RunScriptResult, ScriptAccountRef, ScriptEntry } from './types'

// Bridge to the Fanciaga desktop engine, via the shared Supabase project:
//   • `engine_links` — the engine heartbeats `engine_online_at`; we read it to
//     show ONLINE and flip `pwa_connected` when pairing / disconnecting.
//   • `engine_commands` — we insert a command row; the engine polls, executes
//     it, and writes the result back for us to read.

// The engine heartbeats every ~8s; allow a little slack.
const ONLINE_WINDOW_MS = 30_000

export interface EngineLink {
  engineName: string
  onlineAt: string | null
  online: boolean
  pwaConnected: boolean
}

export async function fetchEngineLink(userId: string): Promise<EngineLink | null> {
  const { data, error } = await supabase
    .from('engine_links')
    .select('engine_name, engine_online_at, pwa_connected')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  const onlineAt = data.engine_online_at ? String(data.engine_online_at) : null
  const online = !!onlineAt && Date.now() - new Date(onlineAt).getTime() < ONLINE_WINDOW_MS
  return {
    engineName: String(data.engine_name ?? ''),
    onlineAt,
    online,
    pwaConnected: !!data.pwa_connected
  }
}

export async function setPwaConnected(userId: string, connected: boolean): Promise<void> {
  await supabase.from('engine_links').upsert({
    user_id: userId,
    pwa_connected: connected,
    pwa_connected_at: connected ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  })
}

async function sendCommand(userId: string, command: string, payload: unknown): Promise<string> {
  const { data, error } = await supabase
    .from('engine_commands')
    .insert({ user_id: userId, command, payload: payload ?? {} })
    .select('id')
    .single()
  if (error || !data) throw new Error('Could not reach the engine — check your connection and try again.')
  return String(data.id)
}

async function waitForCommand(id: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    await new Promise((r) => setTimeout(r, 2_000))
    const { data } = await supabase.from('engine_commands').select('status, result').eq('id', id).maybeSingle()
    if (data?.status === 'done') return (data.result ?? {}) as Record<string, unknown>
    if (data?.status === 'error') {
      const res = (data.result ?? {}) as Record<string, unknown>
      throw new Error(typeof res.error === 'string' ? res.error : 'The engine reported an error.')
    }
    if (Date.now() > deadline) {
      throw new Error('The engine did not respond in time — make sure the Fanciaga app is open and online.')
    }
  }
}

/** One of the custom account labels saved in the Fanciaga app. */
export interface EngineLabel {
  id: string
  name: string
  count: number
}

/** The custom labels saved in the owner's Fanciaga app (Accounts section). */
export async function listEngineLabels(userId: string): Promise<EngineLabel[]> {
  const id = await sendCommand(userId, 'list_labels', {})
  const res = await waitForCommand(id, 60_000)
  return Array.isArray(res.labels) ? (res.labels as EngineLabel[]) : []
}

/**
 * Instagram accounts connected to the engine. Pass a labelId to load ONLY the
 * accounts assigned that custom label — much faster than loading everything.
 */
export async function listEngineAccounts(userId: string, labelId?: string): Promise<EngineAccount[]> {
  const id = await sendCommand(userId, 'list_accounts', labelId ? { labelId } : {})
  const res = await waitForCommand(id, 90_000)
  return Array.isArray(res.accounts) ? (res.accounts as EngineAccount[]) : []
}

/** Replay a Script on the engine, with the IG Selector's account swaps. */
export async function runScriptOnEngine(
  userId: string,
  script: ScriptEntry,
  replacements: Record<string, ScriptAccountRef>
): Promise<RunScriptResult> {
  const id = await sendCommand(userId, 'run_script', { script, replacements })
  const res = await waitForCommand(id, 10 * 60_000)
  return {
    ok: !!res.ok,
    started: Array.isArray(res.started) ? (res.started as RunScriptResult['started']) : [],
    errors: Array.isArray(res.errors) ? (res.errors as RunScriptResult['errors']) : []
  }
}

/**
 * Queue the same script for many Instagram accounts as separate `run_script`
 * commands. The desktop engine stacks them and never runs two at once — so
 * Bundle.social / Grok rate limits stay safe. Returns the command ids in the
 * same order as `runs` so the UI can wait on each for progress.
 */
export async function enqueueScriptStack(
  userId: string,
  script: ScriptEntry,
  runs: Array<{ replacements: Record<string, ScriptAccountRef> }>
): Promise<string[]> {
  if (!runs.length) throw new Error('Select at least one Instagram account.')
  const ids: string[] = []
  for (const run of runs) {
    ids.push(await sendCommand(userId, 'run_script', { script, replacements: run.replacements }))
  }
  return ids
}

/** Wait for one previously-enqueued engine command to finish. */
export async function waitForEngineCommand(id: string, timeoutMs = 10 * 60_000): Promise<RunScriptResult> {
  const res = await waitForCommand(id, timeoutMs)
  return {
    ok: !!res.ok,
    started: Array.isArray(res.started) ? (res.started as RunScriptResult['started']) : [],
    errors: Array.isArray(res.errors) ? (res.errors as RunScriptResult['errors']) : []
  }
}

/** Disconnect from the engine (PWA-side disconnect button). */
export async function disconnectEngine(userId: string): Promise<void> {
  await setPwaConnected(userId, false)
  await sendCommand(userId, 'disconnect', {}).catch(() => {})
}
