import { useEffect, useMemo, useRef, useState } from 'react'
import {
  assignScriptsToTab,
  createScriptTab,
  deleteScript,
  deleteScriptTab,
  listScriptTabs,
  listScripts,
  renameScript,
  renameScriptTab,
  type ScriptTab
} from '../lib/scripts'
import {
  loadScriptPreview,
  saveScriptPostMedia,
  saveScriptSchedule,
  signMediaUrl,
  videoHasNoPicture,
  UNPLAYABLE_VIDEO_MSG,
  type PreviewVideo
} from '../lib/preview'
import {
  listGroupVaultItems,
  listGroupVaultTabs,
  listMyGroups,
  type VaultGroup,
  type VaultItem,
  type VaultTab
} from '../lib/vaults'
import type { ScriptAccountRef, ScriptEntry } from '../lib/types'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  FilmIcon,
  ImageIcon,
  PencilIcon,
  PlayIcon,
  ScriptIcon,
  StopIcon,
  TrashIcon
} from './Icons'

type TabFilter = 'all' | 'unsorted' | string
const TAB_FILTER_KEY = 'f3.scriptsTab'

// Scripts — every script recorded by the Script Writter in the connected
// Fanciaga account, straight from the cloud. Pick one to use it in Posting
// without exporting / uploading a file, or Preview its videos in order.

function accountName(ref: ScriptAccountRef): string {
  return ref.username ? `@${ref.username.replace(/^@+/, '')}` : `#${ref.accountId.slice(0, 8)}…`
}

function fmtAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return new Date(ms).toLocaleString()
  }
}

function fmtDuration(s: number): string {
  if (!s || s <= 0) return ''
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function ScriptsScreen(props: {
  userId: string
  onUseInPosting: (script: ScriptEntry) => void
  onEdit: (script: ScriptEntry) => void
}): JSX.Element {
  const [scripts, setScripts] = useState<ScriptEntry[] | null>(null)
  const [tabs, setTabs] = useState<ScriptTab[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  // Script whose posting order is open in the right Preview sidebar.
  const [previewing, setPreviewing] = useState<ScriptEntry | null>(null)
  // Inline rename: which script is being renamed + the draft name.
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  // Delete: first tap arms the confirm, second tap deletes.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  // Tab sections + multi-select assign.
  const [tabFilter, setTabFilterState] = useState<TabFilter>(() => {
    try {
      return (localStorage.getItem(TAB_FILTER_KEY) as TabFilter) || 'all'
    } catch {
      return 'all'
    }
  })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [assignBusy, setAssignBusy] = useState(false)
  const [newTabOpen, setNewTabOpen] = useState(false)
  const [newTabName, setNewTabName] = useState('')
  const [tabBusy, setTabBusy] = useState(false)
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
  const [renamingTabValue, setRenamingTabValue] = useState('')

  function setTabFilter(f: TabFilter): void {
    setTabFilterState(f)
    setSelected(new Set())
    try {
      localStorage.setItem(TAB_FILTER_KEY, f)
    } catch {
      // ignore
    }
  }

  const filtered = useMemo(() => {
    if (!scripts) return []
    if (tabFilter === 'all') return scripts
    if (tabFilter === 'unsorted') return scripts.filter((s) => !s.tabId)
    return scripts.filter((s) => s.tabId === tabFilter)
  }, [scripts, tabFilter])

  const unsortedCount = useMemo(
    () => (scripts || []).filter((s) => !s.tabId).length,
    [scripts]
  )

  function countInTab(tabId: string): number {
    return (scripts || []).filter((s) => s.tabId === tabId).length
  }

  async function commitDelete(s: ScriptEntry): Promise<void> {
    if (deleteBusy) return
    setDeleteBusy(true)
    setError(null)
    try {
      await deleteScript(s.id)
      setScripts((prev) => (prev || []).filter((x) => x.id !== s.id))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(s.id)
        return next
      })
      setConfirmDeleteId(null)
      if (expanded === s.id) setExpanded(null)
      setPreviewing((prev) => (prev?.id === s.id ? null : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the script.')
    } finally {
      setDeleteBusy(false)
    }
  }

  async function commitRename(s: ScriptEntry): Promise<void> {
    const clean = renameValue.trim()
    if (renameBusy) return
    if (!clean || clean === s.name) {
      setRenamingId(null)
      return
    }
    setRenameBusy(true)
    setError(null)
    try {
      await renameScript(s.id, clean)
      setScripts((prev) => (prev || []).map((x) => (x.id === s.id ? { ...x, name: clean } : x)))
      setRenamingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename the script.')
    } finally {
      setRenameBusy(false)
    }
  }

  async function load(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [list, tabList] = await Promise.all([
        listScripts(props.userId),
        listScriptTabs(props.userId).catch(() => [] as ScriptTab[])
      ])
      setScripts(list)
      setTabs(tabList)
      // Drop a remembered tab that no longer exists.
      if (
        tabFilter !== 'all' &&
        tabFilter !== 'unsorted' &&
        !tabList.some((t) => t.id === tabFilter)
      ) {
        setTabFilter('all')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your scripts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.userId])

  function toggleSelect(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllFiltered(): void {
    setSelected(new Set(filtered.map((s) => s.id)))
  }

  async function moveSelected(tabId: string | null): Promise<void> {
    const ids = [...selected]
    if (!ids.length || assignBusy) return
    setAssignBusy(true)
    setError(null)
    try {
      await assignScriptsToTab(props.userId, ids, tabId)
      setScripts((prev) =>
        (prev || []).map((s) => (ids.includes(s.id) ? { ...s, tabId } : s))
      )
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move those scripts.')
    } finally {
      setAssignBusy(false)
    }
  }

  async function addTab(): Promise<void> {
    if (tabBusy) return
    setTabBusy(true)
    setError(null)
    try {
      const t = await createScriptTab(props.userId, newTabName)
      setTabs((prev) => [...prev, t])
      setNewTabName('')
      setNewTabOpen(false)
      setTabFilter(t.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the tab.')
    } finally {
      setTabBusy(false)
    }
  }

  async function commitTabRename(tab: ScriptTab): Promise<void> {
    const clean = renamingTabValue.trim()
    if (tabBusy) return
    if (!clean || clean === tab.name) {
      setRenamingTabId(null)
      return
    }
    setTabBusy(true)
    setError(null)
    try {
      await renameScriptTab(tab.id, clean)
      setTabs((prev) => prev.map((t) => (t.id === tab.id ? { ...t, name: clean } : t)))
      setRenamingTabId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rename the tab.')
    } finally {
      setTabBusy(false)
    }
  }

  async function removeTab(tab: ScriptTab): Promise<void> {
    if (tabBusy) return
    if (!window.confirm(`Delete tab “${tab.name}”? Scripts inside it move back to Unsorted.`)) return
    setTabBusy(true)
    setError(null)
    try {
      await deleteScriptTab(props.userId, tab.id)
      setTabs((prev) => prev.filter((t) => t.id !== tab.id))
      setScripts((prev) =>
        (prev || []).map((s) => (s.tabId === tab.id ? { ...s, tabId: null } : s))
      )
      if (tabFilter === tab.id) setTabFilter('all')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete the tab.')
    } finally {
      setTabBusy(false)
    }
  }

  const tabLabel = (id: string | null | undefined): string => {
    if (!id) return 'Unsorted'
    return tabs.find((t) => t.id === id)?.name || 'Tab'
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-100">Scripts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Everything you recorded with the Script Writter in your Fanciaga app. Organise them into
            tabs and multi-select to move several at once.
          </p>
        </div>
        <button
          className="rounded-xl border border-white/10 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <button className="shrink-0 text-red-300/80 hover:text-white" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Tab sections */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <TabPill
            active={tabFilter === 'all'}
            label={`All (${scripts?.length ?? 0})`}
            onClick={() => setTabFilter('all')}
          />
          <TabPill
            active={tabFilter === 'unsorted'}
            label={`Unsorted (${unsortedCount})`}
            onClick={() => setTabFilter('unsorted')}
          />
          {tabs.map((t) => (
            <TabPill
              key={t.id}
              active={tabFilter === t.id}
              label={`${t.name} (${countInTab(t.id)})`}
              onClick={() => setTabFilter(t.id)}
            />
          ))}
          {newTabOpen ? (
            <span className="flex items-center gap-1">
              <input
                className="w-28 rounded-full border border-white/15 bg-panel2 px-2 py-1 text-[11px] text-gray-100 outline-none focus:border-accent/50"
                placeholder="Tab name"
                value={newTabName}
                autoFocus
                disabled={tabBusy}
                onChange={(e) => setNewTabName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addTab()
                  if (e.key === 'Escape') {
                    setNewTabOpen(false)
                    setNewTabName('')
                  }
                }}
              />
              <button
                className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                disabled={tabBusy}
                onClick={() => void addTab()}
              >
                Add
              </button>
              <button
                className="rounded-full px-2 py-1 text-[10px] text-gray-500"
                onClick={() => {
                  setNewTabOpen(false)
                  setNewTabName('')
                }}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="rounded-full border border-dashed border-white/15 px-2.5 py-1 text-[11px] text-gray-400 hover:border-accent/40 hover:text-accent"
              onClick={() => setNewTabOpen(true)}
            >
              + New tab
            </button>
          )}
        </div>

        {/* Rename / delete the selected custom tab */}
        {tabFilter !== 'all' &&
          tabFilter !== 'unsorted' &&
          (() => {
            const activeTab = tabs.find((t) => t.id === tabFilter)
            if (!activeTab) return null
            if (renamingTabId === activeTab.id) {
              return (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="text-[11px] text-gray-500">Rename tab</span>
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-accent/50 bg-panel2 px-2 py-1.5 text-xs text-gray-100 outline-none sm:max-w-xs"
                    value={renamingTabValue}
                    autoFocus
                    disabled={tabBusy}
                    onChange={(e) => setRenamingTabValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitTabRename(activeTab)
                      if (e.key === 'Escape') setRenamingTabId(null)
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-lg bg-accent/20 px-2.5 py-1.5 text-[11px] font-semibold text-accent hover:bg-accent/30 disabled:opacity-50"
                    disabled={tabBusy}
                    onClick={() => void commitTabRename(activeTab)}
                  >
                    {tabBusy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg px-2.5 py-1.5 text-[11px] text-gray-500 hover:text-gray-200"
                    disabled={tabBusy}
                    onClick={() => setRenamingTabId(null)}
                  >
                    Cancel
                  </button>
                </div>
              )
            }
            return (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
                <span className="text-gray-500">
                  Tab <span className="font-medium text-gray-300">{activeTab.name}</span>
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-gray-300 hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
                  disabled={tabBusy}
                  onClick={() => {
                    setRenamingTabId(activeTab.id)
                    setRenamingTabValue(activeTab.name)
                  }}
                >
                  <PencilIcon size={12} />
                  Rename
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  disabled={tabBusy}
                  onClick={() => void removeTab(activeTab)}
                >
                  <TrashIcon size={12} />
                  Delete
                </button>
              </div>
            )
          })()}

        {/* Multi-select assign bar */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-gray-200">
            <span className="font-medium text-accent">{selected.size} selected</span>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-gray-400 hover:text-white"
              onClick={selectAllFiltered}
            >
              Select all in tab
            </button>
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-gray-400 hover:text-white"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
            <span className="hidden text-gray-600 sm:inline">·</span>
            <span className="text-gray-500">Move to</span>
            <select
              className="rounded-lg border border-white/10 bg-panel2 px-2 py-1 text-xs text-gray-100 outline-none disabled:opacity-50"
              disabled={assignBusy}
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value
                if (v === '') return
                void moveSelected(v === '__unsorted__' ? null : v)
                e.target.value = ''
              }}
            >
              <option value="" disabled>
                Choose tab…
              </option>
              <option value="__unsorted__">Unsorted</option>
              {tabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {assignBusy && <span className="text-gray-500">Moving…</span>}
          </div>
        )}
      </div>

      {scripts === null && !error ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-gray-500">
          Loading your scripts…
        </div>
      ) : scripts && scripts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-gray-500">
          No scripts yet — open the Fanciaga app, press <span className="text-gray-300">Script Writter</span>{' '}
          to record your posting actions, then save the script and it will show up here.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-gray-500">
          No scripts in this tab — select scripts from All and move them here.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((s) => {
            const open = expanded === s.id
            const isSel = selected.has(s.id)
            return (
              <div
                key={s.id}
                className={`rounded-2xl border bg-white/[0.03] ${
                  isSel ? 'border-accent/50' : 'border-white/10'
                }`}
              >
                <div
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
                  onClick={() => {
                    if (renamingId !== s.id) setExpanded(open ? null : s.id)
                  }}
                >
                  <label
                    className="flex shrink-0 items-center"
                    onClick={(e) => e.stopPropagation()}
                    title="Select to move into a tab"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-white/20 bg-panel2 text-accent focus:ring-accent/40"
                      checked={isSel}
                      onChange={() => toggleSelect(s.id)}
                    />
                  </label>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <ScriptIcon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {renamingId === s.id ? (
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          className="min-w-0 flex-1 rounded-lg border border-accent/50 bg-panel2 px-2 py-1 text-sm text-gray-100 outline-none"
                          value={renameValue}
                          autoFocus
                          disabled={renameBusy}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename(s)
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                        />
                        <button
                          className="shrink-0 rounded-lg bg-accent/20 px-2 py-1 text-[11px] font-medium text-accent hover:bg-accent/30 disabled:opacity-50"
                          disabled={renameBusy}
                          onClick={() => void commitRename(s)}
                        >
                          {renameBusy ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-gray-500 hover:text-gray-200"
                          disabled={renameBusy}
                          onClick={() => setRenamingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="truncate text-sm font-semibold text-gray-100">{s.name}</div>
                        {tabFilter === 'all' && (
                          <span className="shrink-0 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-500">
                            {tabLabel(s.tabId)}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {s.actions.length} action{s.actions.length === 1 ? '' : 's'} ·{' '}
                      {s.accounts.length} account{s.accounts.length === 1 ? '' : 's'} ·{' '}
                      {new Date(s.createdAt).toLocaleString()}
                    </div>
                  </div>
                  {renamingId !== s.id &&
                    (confirmDeleteId === s.id ? (
                      <span
                        className="flex shrink-0 items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="rounded-lg bg-red-500/15 px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/25 disabled:opacity-50"
                          disabled={deleteBusy}
                          onClick={() => void commitDelete(s)}
                        >
                          {deleteBusy ? 'Deleting…' : 'Delete?'}
                        </button>
                        <button
                          className="rounded-lg px-2 py-1 text-[11px] text-gray-500 hover:text-gray-200"
                          disabled={deleteBusy}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <>
                        <button
                          className="shrink-0 rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-white/10 hover:text-gray-200"
                          title="Rename this script"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRenamingId(s.id)
                            setRenameValue(s.name)
                          }}
                        >
                          <PencilIcon size={14} />
                        </button>
                        <button
                          className="shrink-0 rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-red-500/10 hover:text-red-300"
                          title="Delete this script"
                          onClick={(e) => {
                            e.stopPropagation()
                            setConfirmDeleteId(s.id)
                          }}
                        >
                          <TrashIcon size={14} />
                        </button>
                      </>
                    ))}
                  <span className="shrink-0 text-gray-600">
                    {open ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                  </span>
                </div>

                {open && (
                  <div className="border-t border-white/[0.06] px-4 py-3">
                    {s.accounts.length > 0 && (
                      <div className="mb-3">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                          Accounts used
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {s.accounts.map((a) => (
                            <span
                              key={a.accountId}
                              className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-gray-300"
                            >
                              {accountName(a)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                      Logged actions
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {s.actions.length === 0 ? (
                        <div className="text-xs text-gray-600">This script has no actions.</div>
                      ) : (
                        s.actions.map((a, i) => (
                          <div
                            key={a.id}
                            className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                          >
                            <span className="mt-0.5 shrink-0 rounded-full bg-white/[0.06] px-1.5 text-[10px] text-gray-500">
                              {i + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs text-gray-200">{a.summary}</div>
                              <div className="text-[10px] text-gray-600">
                                {new Date(a.at).toLocaleString()}
                                {a.accounts.length > 0 && <> · {a.accounts.map(accountName).join(', ')}</>}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-glow transition-transform hover:scale-[1.02]"
                        onClick={() => props.onUseInPosting(s)}
                      >
                        Use in Posting →
                      </button>
                      <button
                        className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/[0.06]"
                        onClick={() => setPreviewing(s)}
                        title="See the videos this script posts, in order, with the wait time between each post"
                      >
                        Preview
                      </button>
                      <button
                        className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-gray-200 transition-colors hover:bg-white/[0.06]"
                        onClick={() => props.onEdit(s)}
                        title="Change this script’s videos, thumbnails, and posting times"
                      >
                        Edit videos
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {previewing && (
        <ScriptPreviewSidebar
          script={previewing}
          onClose={() => setPreviewing(null)}
          onEdit={() => props.onEdit(previewing)}
          onScriptChange={(next) => {
            setPreviewing(next)
            setScripts((prev) => (prev ? prev.map((x) => (x.id === next.id ? next : x)) : prev))
          }}
        />
      )}
    </div>
  )
}

function TabPill(props: {
  active: boolean
  label: string
  onClick: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
        props.active
          ? 'border-accent/50 bg-accent/15 text-accent'
          : 'border-white/10 bg-white/[0.03] text-gray-400 hover:border-white/20 hover:text-gray-200'
      }`}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}

// ── Preview sidebar — the videos a script posts, in order, with intervals ────
// Videos load and play right here in the sidebar (no fullscreen), and the wait
// between each post is editable and saved back to the script.

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function splitGap(ms: number): { d: number; h: number; m: number } {
  const total = Math.max(0, Math.round(ms / MIN))
  return { d: Math.floor(total / (24 * 60)), h: Math.floor((total % (24 * 60)) / 60), m: total % 60 }
}

function ScriptPreviewSidebar(props: {
  script: ScriptEntry
  onClose: () => void
  onEdit: () => void
  onScriptChange: (script: ScriptEntry) => void
}): JSX.Element {
  const [videos, setVideos] = useState<PreviewVideo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Editable gaps (ms) between consecutive posts — length = videos.length - 1.
  const [gaps, setGaps] = useState<number[]>([])
  // Anchor time for the first post; edits recompute every later post from here.
  const [baseAt, setBaseAt] = useState<number>(() => Date.now())
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  // Key of the post playing inline (its media is signed only while open).
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [picking, setPicking] = useState<{
    key: string
    kind: 'video' | 'thumb'
    actionIndex: number
    slotIndex: number | null
    groupId: string | null
  } | null>(null)
  const [pickBusy, setPickBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setVideos(null)
    setError(null)
    setDirty(false)
    setPlayingKey(null)
    setPicking(null)
    loadScriptPreview(props.script)
      .then((v) => {
        if (!alive) return
        setVideos(v)
        setBaseAt(v[0]?.at ?? Date.now())
        setGaps(v.slice(0, -1).map((x) => x.gapToNextMs ?? 0))
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the preview.')
      })
    return () => {
      alive = false
    }
  }, [props.script])

  // Absolute post times recomputed from the anchor + (possibly edited) gaps.
  const times = useMemo(() => {
    if (!videos) return [] as number[]
    const out: number[] = []
    let t = baseAt
    for (let i = 0; i < videos.length; i++) {
      out.push(t)
      t += gaps[i] ?? 0
    }
    return out
  }, [videos, gaps, baseAt])

  function setGap(i: number, ms: number): void {
    setGaps((prev) => {
      const next = [...prev]
      next[i] = Math.max(0, ms)
      return next
    })
    setDirty(true)
    setSavedNote(null)
  }

  async function applyMediaPick(item: VaultItem): Promise<void> {
    if (!picking) return
    setPickBusy(true)
    setError(null)
    try {
      const pick = { source: 'group' as const, groupId: item.groupId, itemId: item.id }
      const next = await saveScriptPostMedia(
        props.script,
        { actionIndex: picking.actionIndex, slotIndex: picking.slotIndex },
        picking.kind === 'video' ? { video: pick } : { thumbnail: pick }
      )
      props.onScriptChange(next)
      setPicking(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that post.')
    } finally {
      setPickBusy(false)
    }
  }

  async function clearThumb(v: PreviewVideo): Promise<void> {
    setError(null)
    try {
      const next = await saveScriptPostMedia(
        props.script,
        { actionIndex: v.actionIndex, slotIndex: v.slotIndex },
        { thumbnail: null }
      )
      props.onScriptChange(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that thumbnail.')
    }
  }

  async function save(): Promise<void> {
    if (!videos) return
    setSaving(true)
    setError(null)
    try {
      await saveScriptSchedule(
        props.script,
        videos.map((v, i) => ({ actionIndex: v.actionIndex, slotIndex: v.slotIndex, at: times[i] }))
      )
      // Reflect the saved times locally so the list stays in sync.
      setVideos((prev) =>
        prev
          ? prev.map((v, i) => ({
              ...v,
              at: times[i],
              gapToNextMs: i < prev.length - 1 ? gaps[i] ?? 0 : null
            }))
          : prev
      )
      setDirty(false)
      setSavedNote('Intervals saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the new intervals.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* Click-away backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={props.onClose} />

      <aside className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-panel shadow-2xl sm:w-[min(24rem,100vw)]">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-gray-100">Preview — {props.script.name}</h2>
            <p className="mt-0.5 text-[11px] text-gray-500">
              Play videos · change video or thumbnail · edit waits
            </p>
          </div>
          <button
            className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/[0.06]"
            onClick={props.onEdit}
            title="Open the full editor to add, remove, or reorder posts"
          >
            Full edit
          </button>
          <button
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            onClick={props.onClose}
            aria-label="Close preview"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          ) : null}
          {picking ? (
            <PreviewVaultPicker
              kind={picking.kind}
              initialGroupId={picking.groupId}
              busy={pickBusy}
              onPick={(item) => void applyMediaPick(item)}
              onCancel={() => setPicking(null)}
            />
          ) : null}
          {picking ? null : videos === null && !error ? (
            <p className="py-8 text-center text-xs text-gray-500">Loading the posting order…</p>
          ) : videos && videos.length === 0 ? (
            <p className="py-8 text-center text-xs text-gray-500">
              This script has no posts to preview.
            </p>
          ) : videos ? (
            <div className="flex flex-col">
              {videos.map((v, i) => (
                <div key={v.key}>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                    <div className="flex items-center gap-3">
                      {/* Thumbnail → plays the video inline in this same panel. */}
                      <button
                        className="group relative h-20 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40"
                        onClick={() => v.mediaPath && setPlayingKey(playingKey === v.key ? null : v.key)}
                        disabled={!v.mediaPath}
                        title={v.mediaPath ? 'Play here' : 'No cloud copy available'}
                      >
                        {v.thumbUrl ? (
                          <img src={v.thumbUrl} alt={v.title} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-gray-600">
                            <FilmIcon size={16} />
                          </span>
                        )}
                        {v.mediaPath && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-80 transition-opacity group-hover:opacity-100">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-black">
                              {playingKey === v.key ? <StopIcon size={11} /> : <PlayIcon size={11} />}
                            </span>
                          </span>
                        )}
                        {v.durationSeconds > 0 && (
                          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[9px] tabular-nums text-white">
                            {fmtDuration(v.durationSeconds)}
                          </span>
                        )}
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold text-accent">
                            {i + 1}
                          </span>
                          <span className="truncate text-xs font-medium text-gray-200" title={v.title}>
                            {v.title}
                          </span>
                        </div>
                        {v.account && <div className="mt-0.5 truncate text-[11px] text-gray-400">{v.account}</div>}
                        <div className="mt-0.5 text-[10px] text-gray-500">
                          {fmtAt(times[i])}
                          {v.kind === 'image' ? ' · image' : ''}
                        </div>
                        {v.introThumbTitle && (
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-400">
                            {v.introThumbUrl ? (
                              <img src={v.introThumbUrl} alt="" className="h-5 w-5 rounded object-cover" />
                            ) : (
                              <ImageIcon size={11} />
                            )}
                            <span className="truncate">Thumb: {v.introThumbTitle}</span>
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <button
                            className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-white/[0.06] disabled:opacity-40"
                            disabled={v.source !== 'group'}
                            title={
                              v.source !== 'group'
                                ? 'Personal vault videos can be changed in the Fanciaga desktop app'
                                : 'Replace this post’s video'
                            }
                            onClick={() =>
                              setPicking({
                                key: v.key,
                                kind: 'video',
                                actionIndex: v.actionIndex,
                                slotIndex: v.slotIndex,
                                groupId: v.groupId
                              })
                            }
                          >
                            Change video
                          </button>
                          <button
                            className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-white/[0.06]"
                            title="Pick or replace the 0.5s intro thumbnail"
                            onClick={() =>
                              setPicking({
                                key: v.key,
                                kind: 'thumb',
                                actionIndex: v.actionIndex,
                                slotIndex: v.slotIndex,
                                groupId: v.groupId
                              })
                            }
                          >
                            {v.introThumbTitle ? 'Change thumb' : 'Add thumb'}
                          </button>
                          {v.introThumbTitle && (
                            <button
                              className="rounded-md px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-red-300"
                              title="Remove the intro thumbnail"
                              onClick={() => void clearThumb(v)}
                            >
                              Remove thumb
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Inline player — media is signed only while this is open. */}
                    {playingKey === v.key && (
                      <InlinePlayer video={v} onClose={() => setPlayingKey(null)} />
                    )}
                  </div>

                  {/* Editable interval until the NEXT post */}
                  {i < videos.length - 1 && (
                    <GapEditor value={gaps[i] ?? 0} onChange={(ms) => setGap(i, ms)} />
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {!picking && videos && videos.length > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
            <span className="text-[11px] text-gray-500">
              {savedNote ? <span className="text-emerald-400">{savedNote}</span> : dirty ? 'Unsaved interval changes' : 'Intervals up to date'}
            </span>
            <button
              className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save intervals'}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}

// ── Interval editor — days / hours / minutes between two posts ───────────────

function GapEditor(props: { value: number; onChange: (ms: number) => void }): JSX.Element {
  const { d, h, m } = splitGap(props.value)
  const set = (nd: number, nh: number, nm: number): void =>
    props.onChange(nd * DAY + nh * HOUR + nm * MIN)
  const box =
    'w-11 rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-center text-[11px] tabular-nums text-gray-100 outline-none focus:border-accent/60'
  return (
    <div className="flex items-center gap-2 py-1.5 pl-6">
      <span className="h-4 w-px bg-white/15" />
      <span className="text-[10px] text-gray-500">wait</span>
      <label className="flex items-center gap-1 text-[10px] text-gray-500">
        <input
          type="number"
          min={0}
          value={d}
          className={box}
          onChange={(e) => set(Math.max(0, Number(e.target.value) || 0), h, m)}
        />
        d
      </label>
      <label className="flex items-center gap-1 text-[10px] text-gray-500">
        <input
          type="number"
          min={0}
          max={23}
          value={h}
          className={box}
          onChange={(e) => set(d, Math.max(0, Number(e.target.value) || 0), m)}
        />
        h
      </label>
      <label className="flex items-center gap-1 text-[10px] text-gray-500">
        <input
          type="number"
          min={0}
          max={59}
          value={m}
          className={box}
          onChange={(e) => set(d, h, Math.max(0, Number(e.target.value) || 0))}
        />
        m
      </label>
    </div>
  )
}

// ── Inline player — loads the media only while open, then tears it down ──────

function InlinePlayer(props: { video: PreviewVideo; onClose: () => void }): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let alive = true
    setUrl(null)
    setError(null)
    signMediaUrl(props.video)
      .then((u) => {
        if (alive) setUrl(u)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the video.')
      })
    // Drop the buffered media on unmount so the panel stays light.
    return () => {
      alive = false
      const v = videoRef.current
      if (v) {
        try {
          v.pause()
          v.removeAttribute('src')
          v.load()
        } catch {
          // already detached
        }
      }
    }
  }, [props.video])

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-black">
      {error ? (
        <p className="px-3 py-4 text-center text-[11px] text-red-300">{error}</p>
      ) : !url ? (
        <p className="px-3 py-6 text-center text-[11px] text-gray-400">Loading…</p>
      ) : props.video.kind === 'image' ? (
        <img src={url} alt={props.video.title} className="max-h-72 w-full object-contain" />
      ) : (
        <video
          ref={videoRef}
          src={url}
          autoPlay
          controls
          playsInline
          className="max-h-72 w-full"
          onLoadedMetadata={(e) => {
            if (videoHasNoPicture(e.currentTarget)) {
              e.currentTarget.pause()
              setError(UNPLAYABLE_VIDEO_MSG)
            }
          }}
        />
      )}
    </div>
  )
}

function PreviewVaultPicker(props: {
  kind: 'video' | 'thumb'
  initialGroupId: string | null
  busy: boolean
  onPick: (item: VaultItem) => void
  onCancel: () => void
}): JSX.Element {
  const [groups, setGroups] = useState<VaultGroup[] | null>(null)
  const [groupId, setGroupId] = useState(props.initialGroupId || '')
  const [items, setItems] = useState<VaultItem[] | null>(null)
  const [tabs, setTabs] = useState<VaultTab[]>([])
  const [activeTab, setActiveTab] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void listMyGroups()
      .then((g) => {
        setGroups(g)
        if (!groupId && g.length === 1) setGroupId(g[0].id)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your groups.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!groupId) {
      setItems(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    void Promise.all([listGroupVaultItems(groupId), listGroupVaultTabs(groupId).catch(() => [] as VaultTab[])])
      .then(([loaded, loadedTabs]) => {
        if (!alive) return
        setItems(loaded)
        setTabs(loadedTabs)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load that vault.')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [groupId])

  const filtered = (items || []).filter((i) => {
    if (props.kind === 'video' ? i.kind !== 'video' : i.kind !== 'image') return false
    if (!activeTab) return true
    if (activeTab === 'unsorted') return !i.tabId
    return i.tabId === activeTab
  })
  const hasUnsorted = (items || []).some((i) => !i.tabId)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-accent">
            {props.kind === 'video' ? 'Pick a video' : 'Pick a thumbnail'}
          </div>
          <p className="text-[10px] text-gray-500">
            {props.kind === 'video'
              ? 'Tap a video to replace this post.'
              : 'Tap an image to use as the 0.5s intro.'}
          </p>
        </div>
        <button
          className="shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/[0.05]"
          onClick={props.onCancel}
        >
          Cancel
        </button>
      </div>
      <select
        className="rounded-xl border border-white/10 bg-panel2 px-2.5 py-1.5 text-xs text-gray-100 outline-none focus:border-accent/60"
        value={groupId}
        onChange={(e) => {
          setActiveTab('')
          setGroupId(e.target.value)
        }}
      >
        <option value="">{groups === null ? 'Loading groups…' : 'Pick a group vault…'}</option>
        {(groups || []).map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {groupId && (tabs.length > 0 || hasUnsorted) && (
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          <button
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
              activeTab === '' ? 'bg-accent/20 text-white' : 'text-gray-500 hover:text-gray-200'
            }`}
            onClick={() => setActiveTab('')}
          >
            All
          </button>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                activeTab === t.id ? 'bg-accent/20 text-white' : 'text-gray-500 hover:text-gray-200'
              }`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.name}
            </button>
          ))}
          {hasUnsorted && (
            <button
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                activeTab === 'unsorted' ? 'bg-accent/20 text-white' : 'text-gray-500 hover:text-gray-200'
              }`}
              onClick={() => setActiveTab('unsorted')}
            >
              Unsorted
            </button>
          )}
        </div>
      )}
      {error ? (
        <p className="py-4 text-center text-[11px] text-red-300">{error}</p>
      ) : loading ? (
        <p className="py-6 text-center text-[11px] text-gray-500">Loading the vault…</p>
      ) : !groupId ? (
        <p className="py-6 text-center text-[11px] text-gray-500">Pick a group vault above.</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-gray-500">
          {props.kind === 'video' ? 'No videos in this folder.' : 'No images in this folder.'}
        </p>
      ) : (
        <div className={`grid grid-cols-3 gap-1.5 ${props.busy ? 'pointer-events-none opacity-60' : ''}`}>
          {filtered.map((item) => (
            <button
              key={item.id}
              className="overflow-hidden rounded-lg border border-white/[0.06] bg-black/30 text-left hover:border-accent/60"
              onClick={() => props.onPick(item)}
              title={item.title}
            >
              <div className="relative aspect-[9/16] w-full">
                {item.thumbUrl ? (
                  <img src={item.thumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-gray-600">
                    {props.kind === 'video' ? <FilmIcon size={16} /> : <ImageIcon size={16} />}
                  </span>
                )}
              </div>
              <p className="truncate px-1 py-0.5 text-[9px] text-gray-500">{item.title}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
