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

/** Make the Fanciaga desktop window flash fullscreen colors every second. */
export async function flashEngine(userId: string, text: string, seconds = 6): Promise<void> {
  const id = await sendCommand(userId, 'flash', { text, seconds })
  await waitForCommand(id, 30_000).catch(() => {})
}

/** All Instagram accounts connected to the engine (for the IG Selector). */
export async function listEngineAccounts(userId: string): Promise<EngineAccount[]> {
  const id = await sendCommand(userId, 'list_accounts', {})
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

/** Disconnect from the engine (PWA-side disconnect button). */
export async function disconnectEngine(userId: string): Promise<void> {
  await setPwaConnected(userId, false)
  await sendCommand(userId, 'disconnect', {}).catch(() => {})
}
