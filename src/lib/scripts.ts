import { supabase } from './supabase'
import { scriptRowToEntry, type ScriptEntry } from './types'

// Scripts recorded by the desktop Script Writter live in the Supabase
// `scripts` table (private per user). The PWA is signed into the same
// Fanciaga account, so it can read them directly — no engine round trip.
//
// Tab sections reuse the shared `tabs` table with scope = 'scripts'.

const SCRIPT_TAB_SCOPE = 'scripts'

export interface ScriptTab {
  id: string
  name: string
}

export async function listScripts(userId: string): Promise<ScriptEntry[]> {
  const { data, error } = await supabase
    .from('scripts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'Could not load your scripts.')
  return ((data as Array<Record<string, unknown>>) || []).map(scriptRowToEntry)
}

/** Permanently delete a script (it disappears from the desktop app too). */
export async function deleteScript(id: string): Promise<void> {
  const { error } = await supabase.from('scripts').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Could not delete the script.')
}

/** Rename a script — the desktop app treats the cloud as source of truth, so
 *  the new name shows up there too. */
export async function renameScript(id: string, name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new Error('The script name cannot be empty.')
  const { error } = await supabase
    .from('scripts')
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message || 'Could not rename the script.')
}

/** Save a script built in the PWA's Script Creator. Updates in place when the id already exists. */
export async function saveScript(userId: string, entry: ScriptEntry): Promise<void> {
  const now = new Date().toISOString()
  const row = {
    id: entry.id,
    user_id: userId,
    name: entry.name,
    actions: entry.actions,
    accounts: { list: entry.accounts, replacements: entry.replacements },
    tab_id: entry.tabId || null,
    updated_at: now
  }
  const { data: existing, error: lookupError } = await supabase
    .from('scripts')
    .select('id')
    .eq('id', entry.id)
    .maybeSingle()
  if (lookupError) throw new Error(lookupError.message || 'Could not save the script.')
  if (existing) {
    const { error } = await supabase.from('scripts').update(row).eq('id', entry.id)
    if (error) throw new Error(error.message || 'Could not update the script.')
    return
  }
  const { error } = await supabase.from('scripts').insert({
    ...row,
    created_at: new Date(entry.createdAt).toISOString()
  })
  if (error) throw new Error(error.message || 'Could not save the script.')
}

// ── Script tabs ──────────────────────────────────────────────────────────────

export async function listScriptTabs(userId: string): Promise<ScriptTab[]> {
  const { data, error } = await supabase
    .from('tabs')
    .select('id, name')
    .eq('user_id', userId)
    .eq('scope', SCRIPT_TAB_SCOPE)
    .order('created_at', { ascending: true })
  if (error) {
    if (/relation .* does not exist|schema cache/i.test(error.message || '')) {
      throw new Error('The tabs table is missing — run supabase/schema.sql in your Supabase project first.')
    }
    throw new Error(error.message || 'Could not load script tabs.')
  }
  return ((data as Array<Record<string, unknown>>) || []).map((r) => ({
    id: String(r.id),
    name: String(r.name || 'Untitled tab')
  }))
}

export async function createScriptTab(userId: string, name: string): Promise<ScriptTab> {
  const clean = name.trim() || 'New tab'
  const id = crypto.randomUUID()
  const { error } = await supabase.from('tabs').insert({
    id,
    user_id: userId,
    scope: SCRIPT_TAB_SCOPE,
    name: clean
  })
  if (error) throw new Error(error.message || 'Could not create the tab.')
  return { id, name: clean }
}

export async function renameScriptTab(id: string, name: string): Promise<void> {
  const clean = name.trim()
  if (!clean) throw new Error('The tab name cannot be empty.')
  const { error } = await supabase.from('tabs').update({ name: clean }).eq('id', id)
  if (error) throw new Error(error.message || 'Could not rename the tab.')
}

/** Delete a tab and unsort every script that was inside it. */
export async function deleteScriptTab(userId: string, id: string): Promise<void> {
  // Unsort first so scripts aren't left pointing at a missing tab.
  await supabase
    .from('scripts')
    .update({ tab_id: null, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('tab_id', id)
  const { error } = await supabase.from('tabs').delete().eq('id', id).eq('user_id', userId)
  if (error) throw new Error(error.message || 'Could not delete the tab.')
}

/** Assign one or more scripts to a tab (null = move to Unsorted). */
export async function assignScriptsToTab(
  userId: string,
  scriptIds: string[],
  tabId: string | null
): Promise<void> {
  const ids = [...new Set(scriptIds.filter(Boolean))]
  if (!ids.length) return
  const { error } = await supabase
    .from('scripts')
    .update({ tab_id: tabId, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('id', ids)
  if (error) {
    if (/column .*tab_id.* does not exist|schema cache/i.test(error.message || '')) {
      throw new Error(
        'Script tabs need a database update — run the latest supabase/schema.sql (adds scripts.tab_id), then try again.'
      )
    }
    throw new Error(error.message || 'Could not move those scripts.')
  }
}
