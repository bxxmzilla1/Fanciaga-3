import { useEffect, useState } from 'react'
import {
  addBundleKey,
  deleteBundleKey,
  loadApiKeys,
  saveCaptionKeys,
  type ApiKeysState,
  type BundleKeyInfo
} from '../lib/apiKeys'
import { CheckIcon, CloseIcon, KeyIcon, RefreshIcon, TrashIcon } from './Icons'

export default function ApiScreen(props: { userId: string }): JSX.Element {
  const [state, setState] = useState<ApiKeysState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Bundle.social add form
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newAccount, setNewAccount] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Caption keys form
  const [grok, setGrok] = useState('')
  const [openai, setOpenai] = useState('')
  const [anthropic, setAnthropic] = useState('')
  const [gemini, setGemini] = useState('')
  const [savingCaptions, setSavingCaptions] = useState(false)

  async function reload(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const s = await loadApiKeys(props.userId)
      setState(s)
      setGrok(s.grokApiKey)
      setOpenai(s.openaiApiKey)
      setAnthropic(s.anthropicApiKey)
      setGemini(s.geminiApiKey)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your API keys.')
      setState(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.userId])

  async function onAddBundle(): Promise<void> {
    if (adding) return
    setAdding(true)
    setError(null)
    setNotice(null)
    try {
      const added = await addBundleKey(props.userId, newKey, newLabel, newAccount)
      setState((prev) =>
        prev
          ? { ...prev, bundleKeys: [...prev.bundleKeys, added] }
          : { bundleKeys: [added], grokApiKey: grok, openaiApiKey: openai, anthropicApiKey: anthropic, geminiApiKey: gemini }
      )
      setNewKey('')
      setNewLabel('')
      setNewAccount('')
      setNotice('Bundle.social key saved — it will be sent to the engine with every posting script.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that key.')
    } finally {
      setAdding(false)
    }
  }

  async function onDeleteBundle(k: BundleKeyInfo): Promise<void> {
    if (deletingId) return
    setDeletingId(k.id)
    setError(null)
    try {
      await deleteBundleKey(props.userId, k.id)
      setState((prev) => (prev ? { ...prev, bundleKeys: prev.bundleKeys.filter((x) => x.id !== k.id) } : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete that key.')
    } finally {
      setDeletingId(null)
    }
  }

  async function onSaveCaptions(): Promise<void> {
    if (savingCaptions) return
    setSavingCaptions(true)
    setError(null)
    setNotice(null)
    try {
      await saveCaptionKeys(props.userId, {
        grokApiKey: grok,
        openaiApiKey: openai,
        anthropicApiKey: anthropic,
        geminiApiKey: gemini
      })
      setState((prev) =>
        prev
          ? { ...prev, grokApiKey: grok, openaiApiKey: openai, anthropicApiKey: anthropic, geminiApiKey: gemini }
          : prev
      )
      setNotice('Caption API keys saved — the engine will use them when generating captions for your scripts.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save caption keys.')
    } finally {
      setSavingCaptions(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">API</h1>
          <p className="mt-1 text-sm text-gray-500">
            Keys saved here are sent to the Fanciaga engine with every posting script — along with
            temporary access to your vault — so the engine can find your Instagram accounts via
            Bundle.social and download the media, even when your account isn’t logged into that app.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/[0.05] disabled:opacity-50"
          disabled={loading}
          onClick={() => void reload()}
        >
          <RefreshIcon size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon size={14} /> {notice}
          </span>
          <button className="shrink-0 text-emerald-300/70 hover:text-white" onClick={() => setNotice(null)}>
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Bundle.social */}
      <section className="rounded-3xl border border-white/10 bg-panel p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/15 text-accent">
            <KeyIcon size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Bundle.social</h2>
            <p className="text-[11px] text-gray-500">
              Required — the engine uses these keys to list and post to your Instagram accounts.
            </p>
          </div>
        </div>

        {loading && !state ? (
          <p className="text-xs text-gray-600">Loading…</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(state?.bundleKeys || []).map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm text-gray-100">{k.label}</div>
                  <div className="truncate font-mono text-[11px] text-gray-500">{k.preview}</div>
                  {k.account && <div className="truncate text-[11px] text-gray-600">{k.account}</div>}
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                  disabled={deletingId === k.id}
                  title="Remove this key"
                  onClick={() => void onDeleteBundle(k)}
                >
                  <TrashIcon size={14} />
                </button>
              </li>
            ))}
            {state && state.bundleKeys.length === 0 && (
              <li className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-gray-600">
                No Bundle.social keys yet — add one below so the engine can find your Instagram accounts.
              </li>
            )}
          </ul>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-xl border border-white/10 bg-panel2 px-3 py-2 text-xs text-gray-100 placeholder:text-gray-600 focus:border-accent/60 focus:outline-none sm:col-span-2"
            placeholder="Bundle.social API key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <input
            className="rounded-xl border border-white/10 bg-panel2 px-3 py-2 text-xs text-gray-100 placeholder:text-gray-600 focus:border-accent/60 focus:outline-none"
            placeholder="Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <input
            className="rounded-xl border border-white/10 bg-panel2 px-3 py-2 text-xs text-gray-100 placeholder:text-gray-600 focus:border-accent/60 focus:outline-none"
            placeholder="Bundle account email (optional)"
            value={newAccount}
            onChange={(e) => setNewAccount(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="mt-3 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
          disabled={adding || !newKey.trim()}
          onClick={() => void onAddBundle()}
        >
          {adding ? 'Saving…' : 'Add Bundle.social key'}
        </button>
      </section>

      {/* Caption / LLM keys */}
      <section className="rounded-3xl border border-white/10 bg-panel p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-gray-100">Caption APIs</h2>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Optional — used by the engine to generate captions while your script runs. Grok is the
            usual default.
          </p>
        </div>
        <div className="grid gap-2">
          <label className="text-[11px] text-gray-500">
            Grok API key
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-panel2 px-3 py-2 text-xs text-gray-100 focus:border-accent/60 focus:outline-none"
              value={grok}
              onChange={(e) => setGrok(e.target.value)}
              placeholder="xai-…"
            />
          </label>
          <label className="text-[11px] text-gray-500">
            OpenAI API key
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-panel2 px-3 py-2 text-xs text-gray-100 focus:border-accent/60 focus:outline-none"
              value={openai}
              onChange={(e) => setOpenai(e.target.value)}
              placeholder="sk-…"
            />
          </label>
          <label className="text-[11px] text-gray-500">
            Anthropic API key
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-panel2 px-3 py-2 text-xs text-gray-100 focus:border-accent/60 focus:outline-none"
              value={anthropic}
              onChange={(e) => setAnthropic(e.target.value)}
              placeholder="sk-ant-…"
            />
          </label>
          <label className="text-[11px] text-gray-500">
            Gemini API key
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-panel2 px-3 py-2 text-xs text-gray-100 focus:border-accent/60 focus:outline-none"
              value={gemini}
              onChange={(e) => setGemini(e.target.value)}
              placeholder="AIza…"
            />
          </label>
        </div>
        <button
          type="button"
          className="mt-3 rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-gray-100 hover:bg-white/[0.05] disabled:opacity-50"
          disabled={savingCaptions}
          onClick={() => void onSaveCaptions()}
        >
          {savingCaptions ? 'Saving…' : 'Save caption keys'}
        </button>
      </section>

      <p className="text-[11px] leading-relaxed text-gray-600">
        Your vault access is granted automatically with each script — a short-lived session token is
        sent to the engine so it can download the group-vault / personal-vault media your script
        references. The token is never saved on the engine PC.
      </p>
    </div>
  )
}
