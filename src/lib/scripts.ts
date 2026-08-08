import { supabase } from './supabase'
import { scriptRowToEntry, type ScriptEntry } from './types'

// Scripts recorded by the desktop Script Writter live in the Supabase
// `scripts` table (private per user). The PWA is signed into the same
// Fanciaga account, so it can read them directly — no engine round trip.

export async function listScripts(userId: string): Promise<ScriptEntry[]> {
  const { data, error } = await supabase
    .from('scripts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'Could not load your scripts.')
  return ((data as Array<Record<string, unknown>>) || []).map(scriptRowToEntry)
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

/** Save a script built in the PWA's Script Creator to the cloud. */
export async function saveScript(userId: string, entry: ScriptEntry): Promise<void> {
  const { error } = await supabase.from('scripts').insert({
    id: entry.id,
    user_id: userId,
    name: entry.name,
    actions: entry.actions,
    accounts: { list: entry.accounts, replacements: entry.replacements },
    created_at: new Date(entry.createdAt).toISOString(),
    updated_at: new Date().toISOString()
  })
  if (error) throw new Error(error.message || 'Could not save the script.')
}
