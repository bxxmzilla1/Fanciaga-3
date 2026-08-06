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
