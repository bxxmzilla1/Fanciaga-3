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
