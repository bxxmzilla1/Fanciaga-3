import { supabase } from './supabase'
import type { ScriptAccountRef, ScriptAction, ScriptEntry } from './types'

// Script preview — resolves the videos a script will post, in posting order,
// straight from Supabase (the PWA is signed into the same Fanciaga account, so
// the `presets` / `group_vault_items` rows and their storage buckets are
// readable without an engine round trip).
//
// Only lightweight data is fetched up front: metadata + signed THUMBNAIL urls.
// The actual video is signed on demand when the user presses play (fullscreen)
// and torn down again when they close it, so the list stays fast.

export interface PreviewVideo {
  /** Unique per list entry (an item can repeat across slots). */
  key: string
  itemId: string
  source: 'mine' | 'group'
  bucket: 'presets' | 'group-vault'
  title: string
  kind: 'video' | 'image'
  durationSeconds: number
  thumbUrl: string | null
  /** Storage path of the media — signed only when the user presses play. */
  mediaPath: string | null
  /** Epoch ms the post goes out (null = posts immediately). */
  at: number | null
  /** "@username" (or a short list) the post targets. */
  account: string
  /** Wait after THIS post until the next one goes out (null = unknown). */
  gapToNextMs: number | null
  /** Where this post lives in the script, so edited intervals can be written back. */
  actionIndex: number
  /** Slot index within a striker_batch action, or null for single-post actions. */
  slotIndex: number | null
}

interface Ref {
  source: 'mine' | 'group'
  itemId: string
  at: number | null
  account: string
  actionIndex: number
  slotIndex: number | null
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'])

function usernameOf(refs: ScriptAccountRef[], accountId: string): string {
  const r = refs.find((a) => a.accountId === accountId)
  return r?.username ? `@${r.username.replace(/^@+/, '')}` : ''
}

/** The ordered media references a script's actions will post. */
function extractRefs(script: ScriptEntry): Ref[] {
  const out: Ref[] = []
  script.actions.forEach((action, actionIndex) => {
    const input = (action.input || {}) as Record<string, unknown>
    if (action.type === 'striker_batch') {
      // Striker batches are logged with their slots already in chronological
      // order — keep that order for the preview.
      const slots = Array.isArray(input.slots)
        ? (input.slots as Array<Record<string, unknown>>)
        : []
      slots.forEach((s, slotIndex) => {
        if (!s.itemId) return
        const at = s.scheduledFor ? new Date(String(s.scheduledFor)).getTime() : NaN
        out.push({
          source: s.source === 'group' ? 'group' : 'mine',
          itemId: String(s.itemId),
          at: Number.isFinite(at) ? at : null,
          account: usernameOf(action.accounts, String(s.accountId || '')),
          actionIndex,
          slotIndex
        })
      })
    } else {
      const isGroup = action.type === 'multi_post_group'
      const itemId = isGroup ? input.itemId : input.presetId
      if (!itemId) return
      const at = input.scheduledFor ? new Date(String(input.scheduledFor)).getTime() : NaN
      const names = action.accounts
        .map((a) => (a.username ? `@${a.username.replace(/^@+/, '')}` : ''))
        .filter(Boolean)
      out.push({
        source: isGroup ? 'group' : 'mine',
        itemId: String(itemId),
        at: Number.isFinite(at) ? at : null,
        account:
          names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2} more` : ''),
        actionIndex,
        slotIndex: null
      })
    }
  })
  return out
}

interface ItemRow {
  id: string
  title: string
  video_path: string
  thumb_path: string
  ext: string
  duration: number
}

async function signThumbs(
  bucket: 'presets' | 'group-vault',
  paths: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const unique = [...new Set(paths.filter(Boolean))]
  if (!unique.length) return map
  const { data } = await supabase.storage.from(bucket).createSignedUrls(unique, 60 * 60)
  for (const d of data || []) {
    if (d.path && d.signedUrl && !d.error) map.set(d.path, d.signedUrl)
  }
  return map
}

/** Resolve a script's videos in posting order, with thumbnails + intervals. */
export async function loadScriptPreview(script: ScriptEntry): Promise<PreviewVideo[]> {
  const refs = extractRefs(script)
  if (!refs.length) return []

  const mineIds = [...new Set(refs.filter((r) => r.source === 'mine').map((r) => r.itemId))]
  const groupIds = [...new Set(refs.filter((r) => r.source === 'group').map((r) => r.itemId))]

  const [mine, group] = await Promise.all([
    mineIds.length
      ? supabase.from('presets').select('id, title, video_path, thumb_path, ext, duration').in('id', mineIds)
      : Promise.resolve({ data: [] as ItemRow[], error: null }),
    groupIds.length
      ? supabase
          .from('group_vault_items')
          .select('id, title, video_path, thumb_path, ext, duration')
          .in('id', groupIds)
      : Promise.resolve({ data: [] as ItemRow[], error: null })
  ])

  const meta = new Map<string, ItemRow>()
  for (const r of (mine.data as ItemRow[]) || []) meta.set(`m:${r.id}`, r)
  for (const r of (group.data as ItemRow[]) || []) meta.set(`g:${r.id}`, r)

  const [mineThumbs, groupThumbs] = await Promise.all([
    signThumbs('presets', ((mine.data as ItemRow[]) || []).map((r) => r.thumb_path)),
    signThumbs('group-vault', ((group.data as ItemRow[]) || []).map((r) => r.thumb_path))
  ])

  const videos: PreviewVideo[] = refs.map((r, i) => {
    const bucket = r.source === 'mine' ? 'presets' : 'group-vault'
    const row = meta.get(r.source === 'mine' ? `m:${r.itemId}` : `g:${r.itemId}`)
    const thumbs = r.source === 'mine' ? mineThumbs : groupThumbs
    const ext = (row?.ext || 'mp4').toLowerCase()
    return {
      key: `${i}:${r.itemId}`,
      itemId: r.itemId,
      source: r.source,
      bucket,
      title: row?.title || 'Deleted vault item',
      kind: IMAGE_EXTS.has(ext) ? 'image' : 'video',
      durationSeconds: row?.duration || 0,
      thumbUrl: row?.thumb_path ? thumbs.get(row.thumb_path) || null : null,
      mediaPath: row?.video_path || null,
      at: r.at,
      account: r.account,
      gapToNextMs: null,
      actionIndex: r.actionIndex,
      slotIndex: r.slotIndex
    }
  })

  for (let i = 0; i < videos.length - 1; i++) {
    const a = videos[i].at
    const b = videos[i + 1].at
    videos[i].gapToNextMs = a != null && b != null && b >= a ? b - a : null
  }
  return videos
}

/**
 * Sign the actual media URL — only called when the user presses play, so the
 * heavy video is never loaded (or cached) while just browsing the list.
 */
export async function signMediaUrl(v: PreviewVideo): Promise<string> {
  if (!v.mediaPath) throw new Error('This vault item no longer has a cloud copy to play.')
  const { data, error } = await supabase.storage.from(v.bucket).createSignedUrl(v.mediaPath, 60 * 60)
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not create the playback link.')
  return data.signedUrl
}

/**
 * Persist edited posting times back to the script's `actions` in Supabase. The
 * schedule maps each post (by its action/slot origin) to a new absolute epoch
 * ms, which is written as an ISO `scheduledFor`. The desktop Script Writter and
 * the preview both read these timestamps, so the new intervals apply everywhere.
 */
export async function saveScriptSchedule(
  script: ScriptEntry,
  schedule: Array<{ actionIndex: number; slotIndex: number | null; at: number }>
): Promise<void> {
  const actions = JSON.parse(JSON.stringify(script.actions)) as ScriptAction[]
  for (const s of schedule) {
    const action = actions[s.actionIndex]
    if (!action) continue
    const input = ((action.input as Record<string, unknown>) || {}) as Record<string, unknown>
    const iso = new Date(s.at).toISOString()
    if (s.slotIndex != null) {
      const slots = Array.isArray(input.slots)
        ? (input.slots as Array<Record<string, unknown>>)
        : []
      if (slots[s.slotIndex]) slots[s.slotIndex].scheduledFor = iso
    } else {
      input.scheduledFor = iso
    }
    action.input = input
  }
  const { error } = await supabase.from('scripts').update({ actions }).eq('id', script.id)
  if (error) throw new Error(error.message || 'Could not save the new intervals.')
}
