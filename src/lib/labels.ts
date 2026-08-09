import { supabase } from './supabase'

// Custom account labels — saved by the Fanciaga desktop app into the
// `account_labels` table (private per user). Read straight from the cloud
// with the signed-in user's own session, so labels work even when this
// account is NOT logged into any Fanciaga app (code-connected guests).

export interface MyLabel {
  id: string
  name: string
  count: number
  /** Normalized instagram usernames (no @, lowercase) inside the label. */
  usernames: string[]
}

export async function listMyLabels(userId: string): Promise<MyLabel[]> {
  const { data, error } = await supabase
    .from('account_labels')
    .select('id, name, usernames')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message || 'Could not load your labels.')
  return ((data as Array<Record<string, unknown>>) || []).map((r) => {
    const usernames = Array.isArray(r.usernames)
      ? [
          ...new Set(
            (r.usernames as unknown[])
              .map((u) => String(u).trim().replace(/^@+/, '').toLowerCase())
              .filter(Boolean)
          )
        ]
      : []
    return {
      id: String(r.id),
      name: String(r.name || 'Unnamed label'),
      count: usernames.length,
      usernames
    }
  })
}
