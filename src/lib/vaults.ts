import { supabase } from './supabase'

// Group vaults — the PWA is signed into the same Fanciaga account, so the
// `contact_groups` / `group_vault_items` rows (RLS: visible to members) and
// the `group-vault` storage bucket are readable directly. Used by the Script
// Creator to browse videos and thumbnails when building a script.

export interface VaultGroup {
  id: string
  name: string
}

export interface VaultItem {
  id: string
  groupId: string
  title: string
  kind: 'video' | 'image'
  durationSeconds: number
  thumbUrl: string | null
  /** Storage path of the media — signed on demand when the user presses play. */
  mediaPath: string
  /** Vault tab (folder) the item is filed into — null = unsorted. */
  tabId: string | null
  createdAt: number
}

/** A custom tab (folder) inside a group's shared vault. */
export interface VaultTab {
  id: string
  name: string
}

/** The tabs of one group vault, in the same order the desktop app shows them. */
export async function listGroupVaultTabs(groupId: string): Promise<VaultTab[]> {
  const { data, error } = await supabase
    .from('group_vault_tabs')
    .select('id, name')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message || 'Could not load the vault tabs.')
  return ((data as Array<Record<string, unknown>>) || []).map((r) => ({
    id: String(r.id),
    name: String(r.name || 'Untitled tab')
  }))
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'])

/** Every group vault the signed-in user belongs to (owner or member). */
export async function listMyGroups(): Promise<VaultGroup[]> {
  const { data, error } = await supabase
    .from('contact_groups')
    .select('id, name')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'Could not load your groups.')
  return ((data as Array<Record<string, unknown>>) || []).map((r) => ({
    id: String(r.id),
    name: String(r.name || 'Unnamed group')
  }))
}

/** One group's vault items with signed thumbnail URLs (videos AND images). */
export async function listGroupVaultItems(groupId: string): Promise<VaultItem[]> {
  const { data, error } = await supabase
    .from('group_vault_items')
    .select('id, title, video_path, thumb_path, ext, duration, tab_id, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'Could not load that group vault.')
  const rows = (data as Array<Record<string, unknown>>) || []

  const paths = [...new Set(rows.map((r) => String(r.thumb_path || '')).filter(Boolean))]
  const thumbs = new Map<string, string>()
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('group-vault').createSignedUrls(paths, 60 * 60)
    for (const d of signed || []) {
      if (d.path && d.signedUrl && !d.error) thumbs.set(d.path, d.signedUrl)
    }
  }

  return rows.map((r) => {
    const ext = String(r.ext || 'mp4').toLowerCase()
    const thumbPath = String(r.thumb_path || '')
    return {
      id: String(r.id),
      groupId,
      title: String(r.title || 'Untitled'),
      kind: IMAGE_EXTS.has(ext) ? 'image' : 'video',
      durationSeconds: Number(r.duration || 0),
      thumbUrl: thumbPath ? thumbs.get(thumbPath) || null : null,
      mediaPath: String(r.video_path || ''),
      tabId: r.tab_id ? String(r.tab_id) : null,
      createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now()
    }
  })
}

/**
 * Sign the actual media URL — only called when the user presses play, so the
 * heavy video is never loaded while just browsing the thumbnail grid.
 */
export async function signVaultItemUrl(item: VaultItem): Promise<string> {
  if (!item.mediaPath) throw new Error('This vault item no longer has a cloud copy to play.')
  const { data, error } = await supabase.storage
    .from('group-vault')
    .createSignedUrl(item.mediaPath, 60 * 60)
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Could not create the playback link.')
  }
  return data.signedUrl
}
