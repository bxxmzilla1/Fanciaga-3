import { supabase } from './supabase'
import type { EngineAccount, RunScriptResult, ScriptAccountRef, ScriptEntry } from './types'

// Bridge to the Fanciaga desktop engine, via the shared Supabase project:
//   • `engine_links` — the engine heartbeats `engine_online_at`; we read it to
//     show ONLINE and flip `pwa_connected` when pairing / disconnecting.
//   • `engine_commands` — we insert a command row; the engine polls, executes
//     it, and writes the result back for us to read.

// The engine heartbeats every ~8s; allow a little slack.
const ONLINE_WINDOW_MS = 30_000

// ── Connect by engine code (guest mode) ─────────────────────────────────────
// A Fanciaga 3 user can connect to ANY engine with the short code shown in
// that desktop app's Settings — their account does not need to be logged into
// the app. While a code is stored, every command is addressed to that engine.

const CODE_KEY = 'f3.engineCode'

/** "7qk3dm" / "7QK-3DM" / " 7qk 3dm " → "7QK-3DM". */
export function normalizeEngineCode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (cleaned.length !== 6) return cleaned
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`
}

export function getStoredEngineCode(): string {
  try {
    return (localStorage.getItem(CODE_KEY) || '').trim().toUpperCase()
  } catch {
    return ''
  }
}

export function storeEngineCode(code: string): void {
  try {
    const clean = normalizeEngineCode(code)
    if (clean) localStorage.setItem(CODE_KEY, clean)
    else localStorage.removeItem(CODE_KEY)
  } catch {
    // storage unavailable — session-only
  }
}

export interface CodeEngine {
  code: string
  name: string
  onlineAt: string | null
  online: boolean
}

/** Look an engine up by its short code (Settings → Engine code). */
export async function fetchEngineByCode(code: string): Promise<CodeEngine | null> {
  const clean = normalizeEngineCode(code)
  if (!clean) return null
  const { data, error } = await supabase
    .from('engine_instances')
    .select('code, name, online_at')
    .eq('code', clean)
    .order('online_at', { ascending: false })
    .limit(1)
  if (error || !data?.length) return null
  const r = data[0] as Record<string, unknown>
  const onlineAt = r.online_at ? String(r.online_at) : null
  return {
    code: clean,
    name: String(r.name || ''),
    onlineAt,
    online: !!onlineAt && Date.now() - new Date(onlineAt).getTime() < ONLINE_WINDOW_MS
  }
}

export interface EngineLink {
  engineName: string
  onlineAt: string | null
  online: boolean
  pwaConnected: boolean
  /** Instance id assigned to run the scripts ('' = any online Fanciaga app). */
  assignedInstance: string
}

export async function fetchEngineLink(userId: string): Promise<EngineLink | null> {
  // select('*') keeps this working against databases that don't have the
  // newer `assigned_instance` column yet.
  const { data, error } = await supabase
    .from('engine_links')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  const row = data as Record<string, unknown>
  const onlineAt = row.engine_online_at ? String(row.engine_online_at) : null
  const online = !!onlineAt && Date.now() - new Date(onlineAt).getTime() < ONLINE_WINDOW_MS
  return {
    engineName: String(row.engine_name ?? ''),
    onlineAt,
    online,
    pwaConnected: !!row.pwa_connected,
    assignedInstance: String(row.assigned_instance ?? '')
  }
}

// ── Engine instances (assigner) ──────────────────────────────────────────────
// Several Fanciaga apps can be logged into the same account on different PCs.
// Each heartbeats a row in `engine_instances` with the short code shown in
// its Settings; the assigner pins the scripts to one of them.

export interface EngineInstance {
  instanceId: string
  code: string
  name: string
  onlineAt: string | null
  online: boolean
}

export async function listEngineInstances(userId: string): Promise<EngineInstance[]> {
  const { data, error } = await supabase
    .from('engine_instances')
    .select('*')
    .eq('user_id', userId)
    .order('online_at', { ascending: false })
  if (error || !data) return []
  return (data as Array<Record<string, unknown>>).map((r) => {
    const onlineAt = r.online_at ? String(r.online_at) : null
    return {
      instanceId: String(r.instance_id ?? ''),
      code: String(r.code ?? ''),
      name: String(r.name ?? ''),
      onlineAt,
      online: !!onlineAt && Date.now() - new Date(onlineAt).getTime() < ONLINE_WINDOW_MS
    }
  })
}

/** Pin this account's scripts to one Fanciaga app ('' = any online app). */
export async function setAssignedInstance(userId: string, instanceId: string): Promise<void> {
  const { error } = await supabase
    .from('engine_links')
    .update({ assigned_instance: instanceId, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw new Error(error.message || 'Could not save the engine assignment.')
}

export async function setPwaConnected(userId: string, connected: boolean): Promise<void> {
  await supabase.from('engine_links').upsert({
    user_id: userId,
    pwa_connected: connected,
    pwa_connected_at: connected ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  })
}

async function sendCommand(
  userId: string,
  command: string,
  payload: unknown,
  engineCode?: string
): Promise<string> {
  const row: Record<string, unknown> = { user_id: userId, command, payload: payload ?? {} }
  // Explicit code (Posting's target-engine box) wins; otherwise fall back to
  // the code used to connect (guest mode). Empty = our own engine.
  const code = normalizeEngineCode(engineCode || '') || getStoredEngineCode()
  if (code) row.engine_code = code
  const { data, error } = await supabase.from('engine_commands').insert(row).select('id').single()
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

/**
 * Log the target engine into THIS Fanciaga account. The engine signs in with
 * the password (in the background — its active account is untouched) and
 * keeps the session, so from then on every script from this account runs
 * with its own API keys, Bundle.social keys and database. The engine scrubs
 * the password from the command row as soon as it's processed.
 */
export async function loginEngineToMyAccount(
  userId: string,
  password: string,
  engineCode?: string
): Promise<void> {
  const { data } = await supabase.auth.getSession()
  const email = data.session?.user?.email?.trim().toLowerCase()
  if (!email) throw new Error('Your Fanciaga 3 session expired — sign in again.')
  const id = await sendCommand(userId, 'engine_login', { email, password }, engineCode)
  const res = await waitForCommand(id, 60_000)
  if (!res.ok) {
    throw new Error(
      typeof res.error === 'string' ? res.error : 'The engine could not log into your account.'
    )
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
 * Instagram accounts connected to the engine. Pass a label to load ONLY the
 * accounts inside it — much faster than loading everything. The usernames
 * are sent along so filtering also works on engines this account is not
 * logged into (code-connected guests); the labelId is kept for older builds.
 */
export async function listEngineAccounts(
  userId: string,
  label?: { id?: string; usernames?: string[] },
  engineCode?: string
): Promise<EngineAccount[]> {
  const payload: Record<string, unknown> = {}
  if (label?.id) payload.labelId = label.id
  if (label?.usernames?.length) payload.usernames = label.usernames
  const id = await sendCommand(userId, 'list_accounts', payload, engineCode)
  const res = await waitForCommand(id, 90_000)
  return Array.isArray(res.accounts) ? (res.accounts as EngineAccount[]) : []
}

/** Replay a Script on the engine, with the IG Selector's account swaps. */
export async function runScriptOnEngine(
  userId: string,
  script: ScriptEntry,
  replacements: Record<string, ScriptAccountRef>,
  onCommandId?: (commandId: string) => void,
  engineCode?: string
): Promise<RunScriptResult> {
  const id = await sendCommand(userId, 'run_script', { script, replacements }, engineCode)
  onCommandId?.(id)
  const res = await waitForCommand(id, 10 * 60_000)
  return {
    ok: !!res.ok,
    started: Array.isArray(res.started) ? (res.started as RunScriptResult['started']) : [],
    errors: Array.isArray(res.errors) ? (res.errors as RunScriptResult['errors']) : []
  }
}

/**
 * Cancel a command the engine hasn't claimed yet (still "pending"). Returns
 * true when the cancel landed — the engine will never run it.
 */
export async function cancelPendingCommand(commandId: string): Promise<boolean> {
  const { data } = await supabase
    .from('engine_commands')
    .update({
      status: 'error',
      result: { error: 'Force stopped from Fanciaga 3.' },
      done_at: new Date().toISOString()
    })
    .eq('id', commandId)
    .eq('status', 'pending')
    .select('id')
  return !!data?.length
}

/**
 * Tell the engine to force-stop. With a commandId only that queued/running
 * run stops; without one, everything this account has on the engine stops.
 */
export async function forceStopEngine(
  userId: string,
  commandId?: string,
  engineCode?: string
): Promise<void> {
  const id = await sendCommand(userId, 'force_stop', commandId ? { commandId } : {}, engineCode)
  // Best-effort: the stop is latched engine-side even if this wait times out.
  await waitForCommand(id, 30_000).catch(() => {})
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
  runs: Array<{ replacements: Record<string, ScriptAccountRef> }>,
  engineCode?: string
): Promise<string[]> {
  if (!runs.length) throw new Error('Select at least one Instagram account.')
  const ids: string[] = []
  for (const run of runs) {
    ids.push(
      await sendCommand(userId, 'run_script', { script, replacements: run.replacements }, engineCode)
    )
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
