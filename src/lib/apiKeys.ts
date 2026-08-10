import { supabase } from './supabase'

// API keys for Fanciaga 3 — saved under the signed-in user's cloud rows
// (same tables the desktop app uses) and attached to engine commands so a
// host engine can post with THIS user's Bundle.social keys and vault access.

export interface BundleKeyInfo {
  id: string
  label: string
  /** Masked preview for the UI (never the full secret after save). */
  preview: string
  account: string
  createdAt: number
  /** Full secret — kept in memory after load/save so it can be sent to the engine. */
  key: string
}

export interface ApiKeysState {
  bundleKeys: BundleKeyInfo[]
  grokApiKey: string
  openaiApiKey: string
  anthropicApiKey: string
  geminiApiKey: string
}

function maskKey(key: string): string {
  const t = key.trim()
  if (t.length <= 8) return '••••••••'
  return `${t.slice(0, 4)}…${t.slice(-4)}`
}

export async function loadApiKeys(userId: string): Promise<ApiKeysState> {
  const [bundleRes, apiRes] = await Promise.all([
    supabase
      .from('bundlesocial_keys')
      .select('id, label, api_key, account, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
    supabase.from('api_keys').select('grok_api_key, openai_api_key, anthropic_api_key, gemini_api_key').eq('user_id', userId).maybeSingle()
  ])

  if (bundleRes.error) {
    if (/relation .* does not exist|schema cache/i.test(bundleRes.error.message || '')) {
      throw new Error(
        'The bundlesocial_keys table is missing — run supabase/schema.sql in your Supabase project first.'
      )
    }
    throw new Error(bundleRes.error.message || 'Could not load Bundle.social keys.')
  }

  const bundleKeys: BundleKeyInfo[] = ((bundleRes.data as Array<Record<string, unknown>>) || []).map((r) => {
    const key = String(r.api_key || '')
    return {
      id: String(r.id),
      label: String(r.label || 'Bundle key'),
      preview: maskKey(key),
      account: String(r.account || ''),
      createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
      key
    }
  })

  const row = (apiRes.data || {}) as Record<string, unknown>
  return {
    bundleKeys,
    grokApiKey: String(row.grok_api_key || ''),
    openaiApiKey: String(row.openai_api_key || ''),
    anthropicApiKey: String(row.anthropic_api_key || ''),
    geminiApiKey: String(row.gemini_api_key || '')
  }
}

export async function addBundleKey(
  userId: string,
  apiKey: string,
  label?: string,
  account?: string
): Promise<BundleKeyInfo> {
  const key = apiKey.trim()
  if (!key) throw new Error('Enter a Bundle.social API key.')
  const id = crypto.randomUUID()
  const row = {
    id,
    user_id: userId,
    label: (label || '').trim() || 'Bundle key',
    api_key: key,
    account: (account || '').trim(),
    password: '',
    created_at: new Date().toISOString()
  }
  const { error } = await supabase.from('bundlesocial_keys').upsert(row, { onConflict: 'id' })
  if (error) throw new Error(error.message || 'Could not save the Bundle.social key.')
  return {
    id,
    label: row.label,
    preview: maskKey(key),
    account: row.account,
    createdAt: Date.now(),
    key
  }
}

export async function deleteBundleKey(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('bundlesocial_keys').delete().eq('user_id', userId).eq('id', id)
  if (error) throw new Error(error.message || 'Could not delete that key.')
}

export async function saveCaptionKeys(
  userId: string,
  keys: { grokApiKey?: string; openaiApiKey?: string; anthropicApiKey?: string; geminiApiKey?: string }
): Promise<void> {
  // Read-merge so we don't wipe columns this screen doesn't edit.
  const { data: existing } = await supabase.from('api_keys').select('*').eq('user_id', userId).maybeSingle()
  const row: Record<string, unknown> = {
    ...(existing || {}),
    user_id: userId,
    updated_at: new Date().toISOString()
  }
  if (keys.grokApiKey !== undefined) row.grok_api_key = keys.grokApiKey.trim()
  if (keys.openaiApiKey !== undefined) row.openai_api_key = keys.openaiApiKey.trim()
  if (keys.anthropicApiKey !== undefined) row.anthropic_api_key = keys.anthropicApiKey.trim()
  if (keys.geminiApiKey !== undefined) row.gemini_api_key = keys.geminiApiKey.trim()
  const { error } = await supabase.from('api_keys').upsert(row, { onConflict: 'user_id' })
  if (error) throw new Error(error.message || 'Could not save API keys.')
}

/** Credentials attached to every engine command that needs posting power. */
export interface GuestEngineCredentials {
  guest: {
    userId: string
    accessToken: string
    refreshToken: string
    bundleKeys: Array<{ id: string; key: string; label: string; account: string }>
    apiKeys: {
      grokApiKey?: string
      openaiApiKey?: string
      anthropicApiKey?: string
      geminiApiKey?: string
    }
  }
}

/**
 * Build the guest payload the engine overlays for Bundle + vault access.
 * Returns null when the user has nothing useful to send (no keys and no session).
 */
export async function buildGuestCredentials(userId: string): Promise<GuestEngineCredentials | null> {
  const [{ data: sessionData }, keys] = await Promise.all([
    supabase.auth.getSession(),
    loadApiKeys(userId).catch(() => null)
  ])
  const session = sessionData.session
  if (!session?.access_token) return null

  const bundleKeys = (keys?.bundleKeys || [])
    .filter((k) => k.key)
    .map((k) => ({ id: k.id, key: k.key, label: k.label, account: k.account }))

  const apiKeys: GuestEngineCredentials['guest']['apiKeys'] = {}
  if (keys?.grokApiKey) apiKeys.grokApiKey = keys.grokApiKey
  if (keys?.openaiApiKey) apiKeys.openaiApiKey = keys.openaiApiKey
  if (keys?.anthropicApiKey) apiKeys.anthropicApiKey = keys.anthropicApiKey
  if (keys?.geminiApiKey) apiKeys.geminiApiKey = keys.geminiApiKey

  return {
    guest: {
      userId,
      accessToken: session.access_token,
      refreshToken: session.refresh_token || '',
      bundleKeys,
      apiKeys
    }
  }
}
