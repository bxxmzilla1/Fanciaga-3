// Mirrors the Script Writter types in the Fanciaga desktop app
// (src/shared/types.ts) — keep the two in sync.

export interface ScriptAccountRef {
  accountId: string
  keyId: string
  username: string
}

export interface ScriptAction {
  id: string
  at: number
  type: 'multi_post_vault' | 'multi_post_group' | 'striker_batch'
  summary: string
  input: unknown
  accounts: ScriptAccountRef[]
}

export interface ScriptEntry {
  id: string
  name: string
  createdAt: number
  actions: ScriptAction[]
  accounts: ScriptAccountRef[]
  replacements: Record<string, ScriptAccountRef>
}

// The `.fanciaga-script.json` file exported from the desktop Scripts section.
export interface ScriptFile {
  format: 'fanciaga-script'
  version: number
  script: ScriptEntry
}

// An Instagram account connected to the engine (from the 'list_accounts' command).
export interface EngineAccount {
  accountId: string
  keyId: string
  username: string
  displayName: string
  platform: string
}

export interface RunScriptResult {
  ok: boolean
  started: Array<{ actionId: string; summary: string; taskId: string }>
  errors: Array<{ actionId: string; summary: string; error: string }>
}

/** One entry in a multi-account stacked run (same script → many IG accounts). */
export interface StackedRunItem {
  accountId: string
  username: string
  status: 'queued' | 'running' | 'done' | 'error'
  error?: string
  result?: RunScriptResult
}

/**
 * Map a row of the Supabase `scripts` table (written by the desktop Script
 * Writter) to a ScriptEntry. The `accounts` jsonb column holds
 * `{ list, replacements }` (older rows may be a bare array).
 */
export function scriptRowToEntry(r: Record<string, unknown>): ScriptEntry {
  const accountsRaw = (r.accounts ?? {}) as Record<string, unknown>
  const list = Array.isArray(accountsRaw.list)
    ? (accountsRaw.list as ScriptAccountRef[])
    : Array.isArray(r.accounts)
      ? (r.accounts as ScriptAccountRef[])
      : []
  const replacements =
    accountsRaw.replacements && typeof accountsRaw.replacements === 'object'
      ? (accountsRaw.replacements as Record<string, ScriptAccountRef>)
      : {}
  return {
    id: String(r.id),
    name: String(r.name ?? 'Untitled script'),
    createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
    actions: Array.isArray(r.actions) ? (r.actions as ScriptAction[]) : [],
    accounts: list,
    replacements
  }
}

export function parseScriptFile(text: string): ScriptEntry {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error("That file isn't valid JSON — export the Script from Fanciaga's Script Writter section.")
  }
  const file = parsed as Partial<ScriptFile>
  const script = (file.format === 'fanciaga-script' ? file.script : (parsed as ScriptEntry)) as
    | ScriptEntry
    | undefined
  if (!script || !Array.isArray(script.actions)) {
    throw new Error("That doesn't look like a Fanciaga Script file (.fanciaga-script.json).")
  }
  return {
    id: script.id || crypto.randomUUID(),
    name: script.name || 'Untitled script',
    createdAt: script.createdAt || Date.now(),
    actions: script.actions,
    accounts: Array.isArray(script.accounts) ? script.accounts : [],
    replacements: script.replacements && typeof script.replacements === 'object' ? script.replacements : {}
  }
}
